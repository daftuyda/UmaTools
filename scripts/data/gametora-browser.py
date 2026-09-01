import argparse, json, os, sys, time, re, requests, random, threading, queue
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, unquote, urlparse
from urllib3.exceptions import ReadTimeoutError
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import (
    NoSuchElementException, TimeoutException, WebDriverException, StaleElementReferenceException
)
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

# Stat key mappings from JSON abbreviations to display names
STAT_KEY_MAP = {
    "sp": "Speed", "st": "Stamina", "po": "Power", "gu": "Guts",
    "in": "Intelligence", "wi": "Wisdom", "sk": "Skill Points",
    "bo": "Bond", "pt": "Skill Points", "vi": "Vitality", "mo": "Motivation"
}

DELAY = 0.25
RETRIES = 3
NAV_TIMEOUT = 45
JS_TIMEOUT  = 45
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
)

JSON_LOCK = threading.Lock()
THUMB_LOCK = threading.Lock()
_SKILL_NAME_MAP: Optional[Dict[str, str]] = None


def _read_json_list(path: str) -> List[Any]:
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []

def _stable_key(value: Any) -> str:
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value, sort_keys=True, ensure_ascii=False)
        except TypeError:
            return str(value)
    return str(value)

def _pluck(d: Dict[str, Any], dotted: str) -> Any:
    cur: Any = d
    for part in dotted.split("."):
        cur = cur.get(part, None) if isinstance(cur, dict) else None
    return cur

class JsonListStore:
    def __init__(self, path: str, dedup_key: Optional[Tuple[str, ...]] = None,
                 match_key: Optional[str] = None, flush_every: int = 0):
        self.path = path
        self.dedup_key = dedup_key
        self.match_key = match_key
        self.flush_every = max(0, int(flush_every or 0))
        self.lock = threading.Lock()
        self.data: List[Any] = _read_json_list(path)
        self._dedup: set[Tuple[str, ...]] = set()
        self._index: Dict[str, int] = {}
        self._dirty = 0

        if self.dedup_key:
            for item in self.data:
                if isinstance(item, dict):
                    self._dedup.add(self._make_dedup_key(item))

        if self.match_key:
            for i, item in enumerate(self.data):
                if isinstance(item, dict) and item.get(self.match_key) is not None:
                    self._index[str(item.get(self.match_key))] = i

    def _make_dedup_key(self, item: Dict[str, Any]) -> Tuple[str, ...]:
        return tuple(_stable_key(_pluck(item, k)) for k in (self.dedup_key or ()))

    def _maybe_flush(self) -> None:
        if self.flush_every and self._dirty >= self.flush_every:
            _atomic_write(self.path, self.data)
            self._dirty = 0

    def append(self, item: Dict[str, Any]) -> bool:
        with self.lock:
            if self.dedup_key:
                key = self._make_dedup_key(item)
                if key in self._dedup:
                    return False
                self._dedup.add(key)
            self.data.append(item)
            self._dirty += 1
            self._maybe_flush()
            return True

    def upsert(self, match_value: str, patch: Dict[str, Any]) -> None:
        if not self.match_key:
            raise ValueError("JsonListStore.upsert requires match_key")
        key = str(match_value)
        with self.lock:
            idx = self._index.get(key)
            if idx is not None and idx < len(self.data) and isinstance(self.data[idx], dict):
                self.data[idx].update(patch)
            else:
                self.data.append({self.match_key: match_value, **patch})
                self._index[key] = len(self.data) - 1
            self._dirty += 1
            self._maybe_flush()

    def write(self) -> None:
        with self.lock:
            _atomic_write(self.path, self.data)
            self._dirty = 0

def _load_skill_name_map() -> Dict[str, str]:
    global _SKILL_NAME_MAP
    if _SKILL_NAME_MAP is not None:
        return _SKILL_NAME_MAP
    _SKILL_NAME_MAP = {}
    candidates = [
        os.path.join("public", "assets", "skills_all.json"),
        os.path.join("public", "assets", "skills.json"),
        "skills_all.json",
        "skills.json",
    ]
    for path in candidates:
        if not os.path.exists(path):
            continue
        for item in _read_json_list(path):
            if not isinstance(item, dict):
                continue
            sid = item.get("id") or item.get("skill_id") or item.get("skillId")
            if sid is None:
                continue
            name = (
                item.get("name_en")
                or item.get("enname")
                or item.get("name")
                or item.get("jpname")
                or ""
            )
            if name:
                _SKILL_NAME_MAP[str(sid)] = name
        if _SKILL_NAME_MAP:
            break
    return _SKILL_NAME_MAP

def _atomic_write(path: str, data: List[Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.{time.time_ns()}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        for attempt in range(8):
            try:
                os.replace(tmp, path)
                return
            except PermissionError:
                if attempt == 7:
                    raise
                time.sleep(0.05 * (2 ** attempt))
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass

def append_json_item(path_or_store: str | JsonListStore, item: Dict[str, Any],
                     dedup_key: Optional[Tuple[str, ...]] = None) -> bool:
    if isinstance(path_or_store, JsonListStore):
        return path_or_store.append(item)
    path = path_or_store
    with JSON_LOCK:
        data = _read_json_list(path)
        if dedup_key:
            probe = tuple(_stable_key(_pluck(item, k)) for k in dedup_key)
            for existing in data:
                if tuple(_stable_key(_pluck(existing, k)) for k in dedup_key) == probe:
                    return False
        data.append(item)
        _atomic_write(path, data)
        return True

def upsert_json_item(path_or_store: str | JsonListStore, match_key: str, match_value: str,
                     patch: Dict[str, Any]) -> None:
    if isinstance(path_or_store, JsonListStore):
        path_or_store.upsert(match_value, patch)
        return
    path = path_or_store
    with JSON_LOCK:
        data = _read_json_list(path)
        for obj in data:
            if isinstance(obj, dict) and obj.get(match_key) == match_value:
                obj.update(patch)
                _atomic_write(path, data)
                return
        data.append({match_key: match_value, **patch})
        _atomic_write(path, data)

def _make_uma_key(name: str, nickname: str | None, slug: str | None) -> str:
    """Stable key to disambiguate variants."""
    if nickname:
        return f"{name} :: {nickname}"
    if slug:
        return f"{name} :: {slug}"
    return name

def _count_stars(text: str) -> int:
    t = (text or "")
    return t.count("⭐") or t.count("★") or 0

def _get_caption_el(d, caption_text: str):
    """Find a caption div by text, regardless of hashed class suffix."""
    return safe_find(
        d, By.XPATH,
        "//div[contains(@class,'characters_infobox_caption')][contains(translate(normalize-space(.),"
        "'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),"
        f"'{caption_text.lower()}')]"
    )

def _stats_blocks_after_caption(d, cap_el):
    """Collect consecutive stats blocks after caption until the next caption."""
    if not cap_el:
        return []
    try:
        blocks = d.execute_script("""
            const cap = arguments[0];
            const isCaption = n => n && n.classList && [...n.classList].some(c => c.startsWith('characters_infobox_caption__'));
            const isStats   = n => n && n.classList && [...n.classList].some(c => c.startsWith('characters_infobox_stats__'));
            const out = [];
            let el = cap.nextElementSibling;
            while (el && !isCaption(el)) {
              if (isStats(el)) out.push(el);
              el = el.nextElementSibling;
            }
            return out;
        """, cap_el) or []
        # keep only visible nodes
        return [b for b in blocks if is_visible(d, b)]
    except Exception:
        return []

def _label_value(d, label_text: str) -> str:
    el = safe_find(d, By.XPATH,
        f"//div[contains(@class,'characters_infobox_bold_text')][normalize-space()='{label_text}']/following-sibling::div[1]")
    return txt(el)

def _parse_three_sizes(s: str):
    m = re.search(r"(\d+)\s*-\s*(\d+)\s*-\s*(\d+)", s or "")
    if not m: return {}
    return {"B": int(m.group(1)), "W": int(m.group(2)), "H": int(m.group(3))}

def _parse_base_stats_from_block(block) -> dict:
    """Given a single 'characters_infobox_stats' block, return {'stars': 3|5, 'stats': {...}} or {}."""
    stars = 0
    try:
        star_el = block.find_element(By.CSS_SELECTOR, 'div[class*="characters_infobox_row__"] span')
        stars = _count_stars(txt(star_el))
    except Exception:
        pass
    stats = {}
    for split in safe_find_all(block, By.CSS_SELECTOR, 'div[class*="characters_infobox_row_split"]'):
        img = safe_find(split, By.CSS_SELECTOR, 'img[alt]')
        stat_name = img.get_attribute("alt") if img else ""
        if not stat_name: continue
        # last numeric-looking div is the value
        val = None
        for dv in split.find_elements(By.CSS_SELECTOR, "div"):
            m = re.search(r"\d+", txt(dv))
            if m: val = int(m.group(0))
        if val is not None:
            stats[stat_name] = val
    if stars and stats:
        return {"stars": stars, "stats": stats}
    return {}

def _parse_stat_bonuses(block) -> dict:
    """Parse the 'Stat bonuses' single block."""
    out = {}
    for split in safe_find_all(block, By.CSS_SELECTOR, 'div[class*="characters_infobox_row_split"]'):
        img = safe_find(split, By.CSS_SELECTOR, 'img[alt]')
        name = img.get_attribute("alt") if img else ""
        if not name: continue
        raw = ""
        # value sits in a sibling <div>
        for dv in split.find_elements(By.CSS_SELECTOR, "div"):
            t = txt(dv)
            if "%" in t or t == "-" or re.search(r"\d", t): raw = t
        if raw == "-":
            out[name] = 0
        else:
            m = re.search(r"(-?\d+)", raw)
            out[name] = int(m.group(1)) if m else 0
    return out

def _parse_aptitudes(blocks) -> dict:
    """Given blocks after 'Aptitude' and before next caption, return nested dict."""
    apt = {}
    for b in blocks:
        title = txt(safe_find(b, By.CSS_SELECTOR, 'div[class*="characters_infobox_bold_text"]'))
        if not title:  # sometimes the title is on its own row; try again
            try:
                title = b.find_element(By.XPATH, ".//div[contains(@class,'characters_infobox_bold_text')]").text
            except Exception:
                title = ""
        title = title.strip()
        if not title: continue

        sec = {}
        for row in safe_find_all(b, By.CSS_SELECTOR, 'div[class*="characters_infobox_row__"]'):
            for split in safe_find_all(row, By.CSS_SELECTOR, 'div[class*="characters_infobox_row_split"]'):
                cells = split.find_elements(By.CSS_SELECTOR, "div")
                if len(cells) >= 2:
                    key = txt(cells[0])
                    val = txt(cells[-1])
                    if key and val: sec[key] = val
        if sec:
            apt[title] = sec
    return apt

def _parse_top_meta(d) -> tuple[str, int]:
    """Return (nickname, base_stars) from the top infobox area."""
    nickname = ""
    base_stars = 0
    top = safe_find(d, By.CSS_SELECTOR, 'div[class*="characters_infobox_top"]')
    if top:
        # nickname is usually the first italic 'item' text that is not stars
        for it in safe_find_all(top, By.CSS_SELECTOR, 'div[class*="characters_infobox_item"]'):
            t = txt(it)
            if not t: continue
            if "⭐" in t or "★" in t:
                base_stars = max(base_stars, _count_stars(t))
            elif not nickname:
                nickname = t
    return nickname, base_stars

def _abs_url(driver, src: str) -> str:
    if not src: return ""
    if src.startswith("http://") or src.startswith("https://"): return src
    origin = driver.execute_script("return location.origin;") or "https://gametora.com"
    if src.startswith("/"): return origin + src
    return origin + "/" + src

def _normalize_url(url: str, origin: str = "https://gametora.com") -> str:
    if not url:
        return ""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("/"):
        return origin + url
    return origin + "/" + url

def _slug_and_id_from_url(url: str) -> tuple[str, Optional[str]]:
    path = urlparse(url).path.rstrip("/")
    parts = [p for p in path.split("/") if p]
    slug = parts[-1] if parts else ""
    m = re.search(r"(\d{4,})", slug)
    sup_id = m.group(1) if m else None
    return slug, sup_id

def _id_from_img_src(src: str) -> Optional[str]:
    m = re.search(r"support_card_[a-z]_(\d+)\.(?:png|jpg|jpeg|webp)$", src)
    return m.group(1) if m else None

def _ensure_dir(p: str) -> Path:
    d = Path(p)
    d.mkdir(parents=True, exist_ok=True)
    return d

def _save_thumb(url: str, thumbs_dir: str, slug: Optional[str], sup_id: Optional[str]) -> str:
    if not url: return ""
    _ensure_dir(thumbs_dir)
    ext = Path(urlparse(url).path).suffix or ".png"
    base = slug or sup_id or _id_from_img_src(url) or "support"
    # keep it filesystem-safe
    safe = re.sub(r"[^a-z0-9\-_.]", "-", base.lower())
    fname = f"{safe}{ext}"
    dest = Path(thumbs_dir) / fname
    with THUMB_LOCK:
        if not dest.exists() or dest.stat().st_size == 0:
            last_err: Optional[Exception] = None
            for attempt in range(RETRIES + 1):
                try:
                    r = requests.get(url, timeout=20, headers={"User-Agent": USER_AGENT})
                    r.raise_for_status()
                    dest.write_bytes(r.content)
                    time.sleep(0.05)  # be polite
                    last_err = None
                    break
                except Exception as e:
                    last_err = e
                    time.sleep(0.4 * (2 ** attempt))
            if last_err:
                print(f"[thumb] failed {url}: {last_err}")
                return ""
    # return site-relative path for the front-end
    rel = "/" + str(dest.as_posix()).lstrip("/")
    # normalize to your site’s assets folder form:
    rel = rel.replace("//", "/")
    return rel

def _slugify_name(name: str) -> str:
    base = (name or "").strip().lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    return base.strip("-") or "unknown"

def _normalize_image_url(driver, src: str) -> str:
    if not src:
        return ""
    abs_url = _abs_url(driver, src)
    if "/_next/image" in abs_url:
        try:
            q = parse_qs(urlparse(abs_url).query).get("url")
            if q:
                return _abs_url(driver, unquote(q[0]))
        except Exception:
            pass
    return abs_url

def _get_img_src(img) -> str:
    if not img:
        return ""
    for attr in ("src", "data-src", "data-lazy-src", "data-original"):
        v = (img.get_attribute(attr) or "").strip()
        if v:
            return v
    srcset = (img.get_attribute("srcset") or "").strip()
    if srcset:
        first = srcset.split(",")[0].strip().split(" ")[0]
        return first
    return ""

def _extract_bg_image_url(el) -> str:
    if not el:
        return ""
    style = (el.get_attribute("style") or "").strip()
    if not style:
        return ""
    m = re.search(r"url\([\"']?([^\"')]+)[\"']?\)", style)
    return m.group(1) if m else ""

def _find_character_image_url(d, item_data: Dict[str, Any]) -> str:
    for key in ("image", "image_url", "imageUrl", "img", "icon", "thumbnail", "thumb", "portrait", "card", "full"):
        v = item_data.get(key)
        if isinstance(v, str) and v:
            return _normalize_image_url(d, v)
    for key in ("images", "imageData", "image_data", "imgs"):
        v = item_data.get(key)
        if isinstance(v, dict):
            for sub in ("full", "large", "medium", "small", "thumb", "icon", "portrait", "character"):
                s = v.get(sub)
                if isinstance(s, str) and s:
                    return _normalize_image_url(d, s)
        elif isinstance(v, list):
            for s in v:
                if isinstance(s, str) and s:
                    return _normalize_image_url(d, s)
    for v in item_data.values():
        if isinstance(v, str) and "/images/umamusume/character" in v:
            return _normalize_image_url(d, v)

    for img in safe_find_all(d, By.CSS_SELECTOR, "img"):
        if not is_visible(d, img):
            continue
        raw = _get_img_src(img)
        if not raw:
            continue
        if "/images/umamusume/character" in raw or "/images/umamusume/chara" in raw:
            return _normalize_image_url(d, raw)
    return ""

def _save_character_image(url: str, thumbs_dir: str, uma_id: Optional[str], name: str) -> str:
    if not url:
        return ""
    _ensure_dir(thumbs_dir)
    ext = Path(urlparse(url).path).suffix or ".png"
    safe_name = _slugify_name(name)
    safe_id = re.sub(r"[^0-9]", "", str(uma_id or "")) or "unknown"
    fname = f"{safe_id}-{safe_name}{ext}"
    dest = Path(thumbs_dir) / fname
    with THUMB_LOCK:
        if not dest.exists() or dest.stat().st_size == 0:
            last_err: Optional[Exception] = None
            for attempt in range(RETRIES + 1):
                try:
                    r = requests.get(url, timeout=20, headers={"User-Agent": USER_AGENT})
                    r.raise_for_status()
                    dest.write_bytes(r.content)
                    time.sleep(0.05)
                    last_err = None
                    break
                except Exception as e:
                    last_err = e
                    time.sleep(0.4 * (2 ** attempt))
            if last_err:
                print(f"[character image] failed {url}: {last_err}")
                return ""
    rel = "/" + str(dest.as_posix()).lstrip("/")
    rel = rel.replace("//", "/")
    return rel

def collect_character_previews(driver, thumbs_dir: str) -> dict[str, dict]:
    previews: dict[str, dict] = {}
    anchors = safe_find_all(driver, By.CSS_SELECTOR, "a[href*='/umamusume/characters/']")
    anchors = filter_visible(driver, anchors)
    for a in anchors:
        href = a.get_attribute("href") or ""
        if not href or "/umamusume/characters/" not in href:
            continue
        if href.rstrip("/").endswith("/characters"):
            continue
        if _is_character_profile_url(href):
            continue
        slug, uma_id = _slug_and_id_from_url(href)
        img_url = ""
        img = safe_find(a, By.CSS_SELECTOR, "img")
        if img:
            img_url = _normalize_image_url(driver, _get_img_src(img))
        if not img_url:
            for node in a.find_elements(By.CSS_SELECTOR, "*[style*='background-image']"):
                raw = _extract_bg_image_url(node)
                if raw:
                    img_url = _normalize_image_url(driver, raw)
                    break
        if not img_url:
            continue
        name = ""
        if img:
            name = (img.get_attribute("alt") or "").strip()
        if not name:
            name = txt(a)
        local = _save_character_image(img_url, thumbs_dir, uma_id, name or slug or "")
        payload = {"UmaImage": local or img_url, "UmaId": uma_id, "UmaSlug": slug}
        if slug:
            previews[str(slug)] = payload
        if uma_id:
            previews[str(uma_id)] = payload
    return previews

def collect_support_previews_from_items(items: List[Any], thumbs_dir: str) -> dict[str, dict]:
    previews: dict[str, dict] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        slug = str(item.get("slug") or item.get("slug_en") or item.get("name_slug") or "").strip()
        sid = item.get("id") or item.get("support_id") or item.get("supportId") or item.get("sid")
        sid = str(sid) if sid is not None else ""
        img = item.get("image") or item.get("img") or item.get("thumb") or item.get("icon") or item.get("card_img")
        if not img:
            continue
        src = _normalize_url(str(img))
        local = _save_thumb(src, thumbs_dir, slug or None, sid or None)
        info = {"SupportImage": local or src, "SupportId": sid or _id_from_img_src(src)}
        if slug:
            previews[slug] = info
        if sid:
            previews[sid] = info
    return previews

def collect_support_previews(driver, thumbs_dir: str) -> dict[str, dict]:
    previews: dict[str, dict] = {}
    anchors = _wait_support_cards(driver)
    if not anchors:
        _scroll_page_until_stable(driver)
        anchors = _wait_support_cards(driver, timeout_s=4.0)
    for a in anchors:
        href = a.get_attribute("href") or ""
        slug, sid = _slug_and_id_from_url(href)
        if not slug:
            continue
        img = safe_find(a, By.CSS_SELECTOR, "img[src*='/images/umamusume/supports/']")
        src = _abs_url(driver, img.get_attribute("src") or "") if img else ""
        local = _save_thumb(src, thumbs_dir, slug, sid)
        info = {"SupportImage": local or src, "SupportId": sid or _id_from_img_src(src)}
        if slug:
            previews[slug] = info
        if sid:
            previews[str(sid)] = info
    return previews


class RateLimiter:
    def __init__(self, min_interval_s: float = 0.9, jitter_s: float = 0.25):
        self.min_interval_s = max(0.0, float(min_interval_s))
        self.jitter_s = max(0.0, float(jitter_s))
        self._lock = threading.Lock()
        self._next_time = 0.0

    def wait(self) -> None:
        sleep_for = 0.0
        with self._lock:
            now = time.monotonic()
            if now < self._next_time:
                sleep_for = self._next_time - now
            self._next_time = max(self._next_time, now) + self.min_interval_s
        if sleep_for > 0:
            time.sleep(sleep_for)
        if self.jitter_s > 0:
            time.sleep(random.uniform(0.0, self.jitter_s))


def new_driver(headless: bool = True) -> webdriver.Chrome:
    opts = Options()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument("--window-size=1920,1080")

    opts.add_argument(f"--user-agent={USER_AGENT}")

    # Force SwiftShader / software GPU (Chrome 139+)
    opts.add_argument("--enable-unsafe-swiftshader")
    opts.add_argument("--use-gl=swiftshader")
    opts.add_argument("--use-angle=swiftshader")
    opts.add_argument("--ignore-gpu-blocklist")

    # Stable for servers/VMs
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")

    # Quieter + faster loads
    opts.add_argument("--log-level=3")
    opts.add_experimental_option("excludeSwitches", ["enable-logging"])
    opts.set_capability("pageLoadStrategy", "eager")

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)
    driver.set_page_load_timeout(NAV_TIMEOUT)
    driver.set_script_timeout(JS_TIMEOUT)
    
    try:
        driver.command_executor._client_config.timeout = 300
    except Exception:
        pass

    try:
        print("[debug] User-Agent:", driver.execute_script("return navigator.userAgent;"))
    except Exception:
        pass

    return driver

def safe_find(driver, by, sel):
    try: return driver.find_element(by, sel)
    except NoSuchElementException: return None

def safe_find_all(driver, by, sel) -> List[Any]:
    try: return driver.find_elements(by, sel)
    except NoSuchElementException: return []

def wait_css(driver, css: str, timeout: int = 8):
    try:
        return WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, css))
        )
    except (TimeoutException, WebDriverException, ReadTimeoutError):
        return None

def nav(driver, url: str, wait_for_css: Optional[str] = None) -> bool:
    try:
        driver.get(url)
    except (TimeoutException, ReadTimeoutError, WebDriverException):
        try:
            driver.execute_script("window.stop();")
        except Exception:
            pass
    if wait_for_css:
        return wait_css(driver, wait_for_css, timeout=10) is not None
    return True

def txt(el) -> str:
    if not el: return ""
    try: return (el.get_attribute("innerText") or "").strip().replace("\u00a0", " ")
    except Exception: return ""

def wait_for_next_data(driver, timeout: int = 8) -> bool:
    try:
        WebDriverWait(driver, timeout).until(
            lambda d: d.execute_script("return !!document.getElementById('__NEXT_DATA__');")
        )
        return True
    except Exception:
        return False

def extract_next_data(driver) -> Optional[Dict[str, Any]]:
    """Extract __NEXT_DATA__ JSON from the page (Next.js data)."""
    try:
        script = driver.find_element(By.ID, "__NEXT_DATA__")
        if script:
            raw = script.get_attribute("innerHTML") or script.get_attribute("textContent")
            if raw:
                return json.loads(raw)
    except Exception:
        pass
    # Fallback: search for script tag containing __NEXT_DATA__
    try:
        scripts = driver.find_elements(By.TAG_NAME, "script")
        for s in scripts:
            sid = s.get_attribute("id") or ""
            if sid == "__NEXT_DATA__":
                raw = s.get_attribute("innerHTML") or s.get_attribute("textContent")
                if raw:
                    return json.loads(raw)
    except Exception:
        pass
    return None

def get_page_props(driver) -> Optional[Dict[str, Any]]:
    """Get pageProps from __NEXT_DATA__."""
    # Fast path: Next.js exposes window.__NEXT_DATA__
    try:
        data = driver.execute_script("return window.__NEXT_DATA__ || null;")
        if isinstance(data, dict):
            props = data.get("props", {}).get("pageProps", {})
            return props if isinstance(props, dict) else None
    except Exception:
        pass
    data = extract_next_data(driver)
    if data:
        props = data.get("props", {}).get("pageProps", {})
        return props if isinstance(props, dict) else None
    return None

def safe_get_page_props(driver, attempts: int = 2) -> Optional[Dict[str, Any]]:
    for i in range(max(1, attempts)):
        wait_for_next_data(driver, timeout=6 + i * 3)
        props = get_page_props(driver)
        if props:
            return props
        time.sleep(0.2 + i * 0.2)
    return None

def _format_stat_rewards(rewards: List[Any]) -> str:
    """Convert reward abbreviations to readable format like 'Speed +10, Stamina +5'."""
    if not rewards:
        return ""
    parts = []
    for r in rewards:
        if isinstance(r, dict):
            for k, v in r.items():
                stat_name = STAT_KEY_MAP.get(k, k)
                if isinstance(v, (int, float)) and v != 0:
                    sign = "+" if v > 0 else ""
                    parts.append(f"{stat_name} {sign}{v}")
                elif isinstance(v, str):
                    parts.append(f"{stat_name}: {v}")
        elif isinstance(r, str):
            # Handle string format like "sp+10"
            m = re.match(r"([a-z]{2})([+-]?\d+)", r)
            if m:
                stat_name = STAT_KEY_MAP.get(m.group(1), m.group(1))
                val = int(m.group(2))
                sign = "+" if val > 0 else ""
                parts.append(f"{stat_name} {sign}{val}")
    return ", ".join(parts) if parts else ""

# ---------- Visibility helpers ----------
def is_visible(driver, el) -> bool:
    if el is None: return False
    try:
        return bool(driver.execute_script("""
            function isVisible(e){
              if(!e) return false;
              const doc=e.ownerDocument||document;
              function vis(n){
                if(!n||n.nodeType!==1) return true;
                const cs=doc.defaultView.getComputedStyle(n);
                if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)===0) return false;
                return vis(n.parentElement);
              }
              if(!vis(e)) return false;
              const r=e.getBoundingClientRect();
              return r.width>0&&r.height>0;
            }
            return isVisible(arguments[0]);
        """, el))
    except Exception:
        try: return el.is_displayed()
        except Exception: return False

def filter_visible(driver, elements: List[Any]) -> List[Any]:
    return [e for e in elements if is_visible(driver, e)]

def _scroll_page_until_stable(driver, max_rounds: int = 10, delay: float = 0.2) -> None:
    """Scroll to trigger lazy-loaded content; stop when height stabilizes."""
    try:
        last_height = driver.execute_script("return document.body.scrollHeight")
    except Exception:
        return
    for _ in range(max_rounds):
        try:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        except Exception:
            break
        time.sleep(delay)
        try:
            new_height = driver.execute_script("return document.body.scrollHeight")
        except Exception:
            break
        if new_height == last_height:
            break
        last_height = new_height
    try:
        driver.execute_script("window.scrollTo(0, 0);")
    except Exception:
        pass

def _extract_items_by_keys(page_props: Optional[Dict[str, Any]], keys: Tuple[str, ...]) -> List[Dict[str, Any]]:
    if not isinstance(page_props, dict):
        return []
    for key in keys:
        v = page_props.get(key)
        if isinstance(v, list):
            return v
    data = page_props.get("data")
    if isinstance(data, dict):
        for key in keys:
            v = data.get(key)
            if isinstance(v, list):
                return v
    return []

def _collect_urls_from_items(items: List[Any], builder) -> List[str]:
    urls: List[str] = []
    seen: set[str] = set()
    for item in items:
        url = builder(item)
        if url and url not in seen:
            seen.add(url)
            urls.append(url)
    return urls

def _is_character_profile_url(url: str) -> bool:
    if not url:
        return False
    return "/umamusume/characters/profiles" in url

def _build_support_url(item: Any) -> str:
    if not isinstance(item, dict):
        return ""
    for key in ("url", "link", "href", "path"):
        if item.get(key):
            return _normalize_url(str(item.get(key)))
    slug = item.get("slug") or item.get("slug_en") or item.get("name_slug") or ""
    item_id = item.get("id") or item.get("support_id") or item.get("supportId") or item.get("sid")
    if slug:
        if "/" in str(slug):
            return _normalize_url(str(slug))
        if item_id:
            return f"https://gametora.com/umamusume/supports/{item_id}-{slug}"
        return f"https://gametora.com/umamusume/supports/{slug}"
    if item_id:
        return f"https://gametora.com/umamusume/supports/{item_id}"
    return ""

def _build_character_url(item: Any) -> str:
    if not isinstance(item, dict):
        return ""
    for key in ("url", "link", "href", "path"):
        if item.get(key):
            return _normalize_url(str(item.get(key)))
    slug = item.get("slug") or item.get("slug_en") or item.get("name_slug") or ""
    item_id = item.get("id") or item.get("chara_id") or item.get("character_id") or item.get("uma_id")
    if slug:
        if "/" in str(slug):
            return _normalize_url(str(slug))
        if item_id:
            return f"https://gametora.com/umamusume/characters/{item_id}-{slug}"
        return f"https://gametora.com/umamusume/characters/{slug}"
    if item_id:
        return f"https://gametora.com/umamusume/characters/{item_id}"
    return ""

def _collect_support_card_anchors(driver) -> List[Any]:
    anchors: List[Any] = []
    seen_hrefs = set()

    # Prefer anchors that include support card images.
    for img in safe_find_all(driver, By.CSS_SELECTOR, "img[src*='/images/umamusume/supports/']"):
        try:
            a = img.find_element(By.XPATH, "./ancestor::a[1]")
            href = a.get_attribute("href") or ""
            if href and href not in seen_hrefs:
                seen_hrefs.add(href)
                anchors.append(a)
        except Exception:
            continue

    if anchors:
        return filter_visible(driver, anchors)

    # Fallback to any support link that is not the list page itself.
    for a in safe_find_all(driver, By.CSS_SELECTOR, "a[href*='/umamusume/supports/']"):
        href = a.get_attribute("href") or ""
        if re.search(r"/umamusume/supports/?$", href):
            continue
        # Check if it's a specific support card page (has ID in URL)
        if re.search(r'/supports/\d+-', href):
            if href not in seen_hrefs:
                seen_hrefs.add(href)
                anchors.append(a)

    return filter_visible(driver, anchors)

def _wait_support_cards(driver, timeout_s: float = 8.0) -> List[Any]:
    end = time.time() + timeout_s
    while time.time() < end:
        anchors = _collect_support_card_anchors(driver)
        if anchors:
            return anchors
        time.sleep(0.2)
    return []


def _click(driver, css) -> bool:
    el = safe_find(driver, By.CSS_SELECTOR, css)
    if not el: return False
    try: el.click(); return True
    except Exception: return False

def accept_cookies(driver):
    _click(driver, 'body > div#__next > div[class*=legal_cookie_banner_wrapper__] '
                   '> div > div[class*=legal_cookie_banner_selection__] '
                   '> div:last-child > button[class*=legal_cookie_banner_button__]')
    time.sleep(0.2)

def open_settings(driver):
    _click(driver, 'body > div#__next > div > div[class*=styles_page__] '
                   '> header[id*=styles_page-header__] '
                   '> div[class*=styles_header_settings__]')
    time.sleep(0.15)

def _click_label_by_partial_text(driver, *candidates: str) -> bool:
    try: labels = driver.find_elements(By.CSS_SELECTOR, 'div[data-tippy-root] label')
    except Exception: labels = []
    for lb in labels:
        t = (lb.text or "").strip().lower()
        for want in candidates:
            if want.lower() in t:
                try: lb.click(); time.sleep(0.1); return True
                except Exception: pass
    return False

def ensure_server(driver, server: str = "global", keep_raw_en: bool = True):
    accept_cookies(driver); open_settings(driver)
    if server == "global":
        _click_label_by_partial_text(driver, "Global", "EN (Global)", "English (Global)")
    else:
        _click_label_by_partial_text(driver, "Japan", "JP", "Japanese")
    if keep_raw_en:
        _click(driver, 'body > div[data-tippy-root] > div.tippy-box > div.tippy-content > div '
                       '> div[class*=tooltips_tooltip__] > div:last-child > div:last-child > div:last-child > label')
    driver.execute_script("""
        try {
          localStorage.setItem('i18nextLng','en');
          localStorage.setItem('umamusume_server', arguments[0]);
          localStorage.setItem('u-eh-server', arguments[0]);
          localStorage.setItem('u-eh-region', arguments[0]);
          localStorage.setItem('server', arguments[0]);
        } catch(e) {}
    """, "global" if server == "global" else "japan")
    try: driver.find_element(By.TAG_NAME, "body").click()
    except Exception: pass
    time.sleep(0.15); driver.refresh(); time.sleep(0.3)


def tippy_show_and_get_popper(driver, ref_el):
    try:
        popper = driver.execute_script("""
            const el = arguments[0];
            if (!el || !el._tippy) return null;
            const t = el._tippy;
            t.setProps({ trigger: 'manual', allowHTML: true, interactive: true, placement: 'bottom' });
            t.show();
            return t.popper || null;
        """, ref_el)
        time.sleep(0.05)
        return popper
    except Exception:
        return None

def tippy_hide(driver, ref_el):
    try: driver.execute_script("if(arguments[0] && arguments[0]._tippy){arguments[0]._tippy.hide();}", ref_el)
    except Exception: pass


def parse_event_from_tippy_popper(popper_el) -> List[Dict[str, str]]:
    results: List[Dict[str, str]] = []
    if not popper_el: return results
    rows = popper_el.find_elements(By.CSS_SELECTOR, 'table[class*="tooltips_ttable__"] > tbody > tr')
    if rows:
        for tr in rows:
            try:
                opt = txt(tr.find_element(By.CSS_SELECTOR, "td:nth-of-type(1)"))
                val = txt(tr.find_element(By.CSS_SELECTOR, "td:nth-of-type(2)"))
                if opt or val: results.append({opt: val})
            except Exception: continue
        return results
    many = popper_el.find_elements(By.CSS_SELECTOR, 'div[class*="tooltips_ttable_cell___"] > div')
    if many:
        for dv in many:
            s = txt(dv)
            if s: results.append({"": s})
        return results
    try:
        single = popper_el.find_element(By.CSS_SELECTOR, 'div[class*="tooltips_ttable_cell__"]')
        s = txt(single)
        if s: results.append({"": s})
    except Exception:
        pass
    return results


def _first_tippy_anchor_under(driver, root):
    """Return the first descendant element that has a Tippy instance (._tippy), if any."""
    try:
        return driver.execute_script("""
            const root = arguments[0];
            const it = document.createNodeIterator(root, NodeFilter.SHOW_ELEMENT);
            let n;
            while ((n = it.nextNode())) {
              if (n._tippy) return n;
            }
            return null;
        """, root)
    except Exception:
        return None

def _skill_id_from_href(href: str) -> str:
    if not href:
        return ""
    href = href.split("?")[0].rstrip("/")
    if "/umamusume/skills/" in href:
        return href.split("/")[-1]
    return ""

def parse_hint_level_from_text(text: str) -> Optional[int]:
    m = re.search(r"hint\s*lv\.?\s*([0-5])", text or "", flags=re.I)
    if m: return int(m.group(1))
    m = re.search(r"lv\.?\s*([0-5])\s*hint", text or "", flags=re.I)
    if m: return int(m.group(1))
    return None

def parse_support_hints_on_page(d) -> List[Dict[str, Any]]:
    """
    Collect tiles that appear after the 'Support hints' or 'Skills from events' captions
    and before the very next caption block (class startswith 'supports_infobox_caption__'),
    regardless of nesting.
    """
    hints: List[Dict[str, Any]] = []
    seen_names = set()

    # Find visible "Support hints" and "Skills from events" captions
    captions: List[Any] = []
    for label in ("support hints", "skills from events"):
        found = d.find_elements(
            By.XPATH,
            "//*[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),"
            f"'{label}')]"
        )
        captions.extend([c for c in found if is_visible(d, c)])
    if not captions:
        return hints

    for cap in captions:
        # JS: walk the DOM forward from this caption; collect skill-icon <img>s
        # until the next caption (class startswith supports_infobox_caption__).
        imgs = d.execute_script("""
            const cap = arguments[0];
            const isCaption = (el) => {
              if (!el || !el.classList) return false;
              for (const cls of el.classList) {
                if (String(cls).startsWith('supports_infobox_caption__')) return true;
              }
              return false;
            };

            // TreeWalker across the full document so nested captions are seen.
            const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
            // advance to 'cap'
            let n = tw.currentNode;
            while (n && n !== cap) n = tw.nextNode();
            // now walk forward, collecting imgs until the next caption is hit
            const out = [];
            while ((n = tw.nextNode())) {
              if (n !== cap && isCaption(n)) break; // stop at the next caption
              if (n.tagName === 'IMG' && n.src && n.src.includes('/images/umamusume/skill_icons/utx_ico_skill_')) {
                out.push(n);
              }
            }
            return out;
        """, cap) or []

        # Per-block hint level (if they show "Hint Lv.X" near the hints)
        block_text = ""
        try:
            # gather text from nodes between cap and next caption (for hint-lv scan)
            block_text = d.execute_script("""
                const cap = arguments[0];
                const isCaption = (el) => {
                  if (!el || !el.classList) return false;
                  for (const cls of el.classList) {
                    if (String(cls).startsWith('supports_infobox_caption__')) return true;
                  }
                  return false;
                };
                const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
                let n = tw.currentNode, txt = '';
                while (n && n !== cap) n = tw.nextNode();
                while ((n = tw.nextNode())) {
                  if (n !== cap && isCaption(n)) break;
                  txt += ' ' + (n.innerText || '');
                }
                return txt;
            """, cap) or ""
        except Exception:
            pass
        block_hint_lv = parse_hint_level_from_text(block_text)

        # Turn images into tiles (climb to the element that contains <b>name</b>)
        for img in imgs:
            if not is_visible(d, img):
                continue

            # climb to the tile block that has a <b> name
            tile = img
            for _ in range(6):
                try:
                    if tile.find_elements(By.XPATH, ".//b"):
                        break
                except Exception:
                    pass
                try:
                    tile = tile.find_element(By.XPATH, "..")
                except Exception:
                    tile = None
                    break
            if not tile:
                continue

            # read the name from this tile only
            try:
                b = tile.find_element(By.XPATH, ".//b[1]")
                name = (b.get_attribute("innerText") or "").strip()
            except Exception:
                name = ""
            if not name:
                for attr in ("alt", "title", "aria-label"):
                    try:
                        name = (img.get_attribute(attr) or "").strip()
                    except Exception:
                        name = ""
                    if name:
                        break
            if not name:
                try:
                    raw = (tile.get_attribute("innerText") or "").strip()
                    if raw:
                        parts = [p.strip() for p in re.split(r"[\r\n]+", raw) if p.strip()]
                        parts = [p for p in parts if not re.search(r"hint\\s*lv|lv\\.?\\s*\\d|hint", p, flags=re.I)]
                        if parts:
                            name = parts[0]
                except Exception:
                    pass
            if not name or name in seen_names:
                continue

            # Try to find a real /umamusume/skills/<id> link inside the tile
            sid = ""
            try:
                for a in tile.find_elements(By.XPATH, ".//a[contains(@href,'/umamusume/skills/')]"):
                    sid = _skill_id_from_href(a.get_attribute("href") or "")
                    if sid:
                        break
            except Exception:
                pass

            # Fallback: open tooltip on the tile (if any) and look for a link there
            if not sid:
                tippy_anchor = _first_tippy_anchor_under(d, tile)
                pop = None
                if tippy_anchor is not None:
                    pop = tippy_show_and_get_popper(d, tippy_anchor)
                try:
                    if pop:
                        if not name:
                            try:
                                cand = pop.find_element(By.CSS_SELECTOR, "b, strong, h3, h4")
                                name = (cand.get_attribute("innerText") or "").strip()
                            except Exception:
                                pass
                        for l in pop.find_elements(By.CSS_SELECTOR, 'a[href*="/umamusume/skills/"]'):
                            sid = _skill_id_from_href(l.get_attribute("href") or "")
                            if sid:
                                break
                finally:
                    if tippy_anchor is not None:
                        tippy_hide(d, tippy_anchor)

            if sid and not name:
                name = _load_skill_name_map().get(sid, "")

            if not name or name in seen_names:
                continue

            hints.append({
                "SkillId": sid,            # stays "" if no link is exposed
                "Name": name,
                "HintLevel": block_hint_lv # None when not shown
            })
            seen_names.add(name)

    return hints


def _extract_hint_names_from_events(events: List[Dict[str, Any]]) -> List[str]:
    """Extract skill hint names from event option text (e.g. 'Masterful Gambit hint +1')."""
    names: List[str] = []
    seen: set = set()
    for evt in events:
        if not isinstance(evt, dict):
            continue
        for val in (evt.get("EventOptions") or {}).values():
            for m in re.finditer(r"(.+?)\s+hint\s+\+\d", str(val)):
                name = m.group(1).strip()
                if name and name not in seen:
                    seen.add(name)
                    names.append(name)
    return names


def _merge_event_hints_into_support_hints(
    hints: List[Dict[str, Any]], event_hint_names: List[str]
) -> List[Dict[str, Any]]:
    """Add event-derived hint names to the hints list (as SupportHints entries) if not already present."""
    existing = set()
    for h in hints:
        if isinstance(h, dict):
            existing.add(h.get("Name", ""))
        elif isinstance(h, str):
            existing.add(h)
    for name in event_hint_names:
        if name not in existing:
            hints.append({"SkillId": "", "Name": name, "HintLevel": None, "Source": "event"})
            existing.add(name)
    return hints


def make_support_card(event_name: str, opts: Dict[str, str], support_slug: str = "") -> Dict[str, Any]:
    d: Dict[str, Any] = {"EventName": event_name, "EventOptions": opts}
    if support_slug:
        d["SupportSlug"] = support_slug
    return d

def make_career(event_name: str, opts: Dict[str, Any]) -> Dict[str, Any]:
    return {"EventName": event_name, "EventOptions": opts}

def make_race(race_name: str, schedule: str, grade: str, terrain: str,
              distance_type: str, distance_meter: str, season: str,
              fans_required: str, fans_gained: str) -> Dict[str, Any]:
    return {
        "RaceName": race_name,
        "Schedule": schedule,
        "Grade": grade,
        "Terrain": terrain,
        "DistanceType": distance_type,
        "DistanceMeter": distance_meter,
        "Season": season,
        "FansRequired": fans_required,
        "FansGained": fans_gained
    }


def with_retries(func, *args, **kwargs):
    last_exc = None
    for attempt in range(RETRIES + 1):
        try:
            return func(*args, **kwargs)
        except (TimeoutException, WebDriverException, StaleElementReferenceException, ReadTimeoutError) as e:
            last_exc = e
            time.sleep(0.6 + attempt * 0.4)
            continue
    if last_exc:
        raise last_exc
    return None


def _looks_like_event_entry(obj: Any) -> bool:
    if not isinstance(obj, dict):
        return False
    return any(k in obj for k in ("n", "name", "c", "choices", "r", "rewards"))

def _pick_event_lang_data(event_data: Any, lang: str) -> Any:
    if not isinstance(event_data, dict):
        return event_data
    for key in (lang, lang.split("-")[0], "en", "ja", "jp"):
        if key in event_data:
            return event_data.get(key)
    return event_data

def _iter_event_lists(lang_data: Any) -> List[List[Any]]:
    lists: List[List[Any]] = []
    if isinstance(lang_data, list):
        return [lang_data]
    if isinstance(lang_data, dict):
        # Common container key
        for key in ("events", "event", "eventData", "event_data"):
            val = lang_data.get(key)
            if isinstance(val, list):
                return [val]
        for val in lang_data.values():
            if isinstance(val, list) and any(_looks_like_event_entry(x) for x in val):
                lists.append(val)
        if _looks_like_event_entry(lang_data):
            lists.append([lang_data])
    return lists

def _format_event_rewards(rewards: Any) -> str:
    if rewards is None:
        return ""
    if isinstance(rewards, list):
        return _format_stat_rewards(rewards)
    if isinstance(rewards, dict):
        return _format_stat_rewards([rewards])
    if isinstance(rewards, str):
        return rewards.strip()
    return str(rewards)

def _parse_events_from_json(event_data: Dict[str, Any], lang: str = "en", support_slug: str = "") -> List[Dict[str, Any]]:
    """Parse events from JSON, auto-detecting categories and lists."""
    events: List[Dict[str, Any]] = []
    if not event_data:
        return events

    lang_data = _pick_event_lang_data(event_data, lang)
    event_lists = _iter_event_lists(lang_data)
    if not event_lists and isinstance(event_data, dict):
        event_lists = _iter_event_lists(event_data)

    for cat_events in event_lists:
        if not isinstance(cat_events, list):
            continue
        for evt in cat_events:
            if not isinstance(evt, dict):
                continue

            event_name = evt.get("n") or evt.get("name") or evt.get("title") or ""
            if not event_name:
                continue

            choices = (
                evt.get("c")
                or evt.get("choices")
                or evt.get("opts")
                or evt.get("options")
                or []
            )
            if isinstance(choices, dict):
                choices = [{"name": k, "rewards": v} for k, v in choices.items()]

            if not choices:
                rewards = (
                    evt.get("r")
                    or evt.get("rewards")
                    or evt.get("reward")
                    or evt.get("effects")
                    or evt.get("stats")
                    or []
                )
                reward_str = _format_event_rewards(rewards)
                events.append(make_support_card(event_name, {"(Auto)": reward_str or "See details"}, support_slug))
            else:
                for choice in choices:
                    if isinstance(choice, dict):
                        choice_name = (
                            choice.get("n")
                            or choice.get("name")
                            or choice.get("label")
                            or choice.get("text")
                            or "Option"
                        )
                        rewards = (
                            choice.get("r")
                            or choice.get("rewards")
                            or choice.get("reward")
                            or choice.get("effects")
                            or choice.get("stats")
                            or []
                        )
                        reward_str = _format_event_rewards(rewards)
                        events.append(make_support_card(event_name, {choice_name: reward_str or "See details"}, support_slug))
                    elif isinstance(choice, str):
                        events.append(make_support_card(event_name, {choice: "See details"}, support_slug))

    return events

def _event_entry_key(ev: Dict[str, Any]) -> Tuple[str, str]:
    name = (ev.get("EventName") or "").strip().lower()
    opts = ev.get("EventOptions") or {}
    opt_name = ""
    if isinstance(opts, dict) and opts:
        opt_name = str(next(iter(opts.keys()))).strip().lower()
    return (name, opt_name)

def _merge_event_entries(json_events: List[Dict[str, Any]],
                         dom_events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not dom_events:
        return json_events
    if not json_events:
        return dom_events
    merged: List[Dict[str, Any]] = []
    pos: Dict[Tuple[str, str], int] = {}
    for ev in json_events:
        key = _event_entry_key(ev)
        pos[key] = len(merged)
        merged.append(ev)
    for ev in dom_events:
        key = _event_entry_key(ev)
        if key in pos:
            merged[pos[key]] = ev
        else:
            pos[key] = len(merged)
            merged.append(ev)
    return merged

def _parse_event_helper_events_from_page(d, support_slug: str = "") -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    # Try the same event helper list used on support pages
    lists = safe_find_all(d, By.CSS_SELECTOR, 'div[class*=eventhelper_elist]')
    if not lists:
        # Fallback: broader selectors seen on event helper pages
        lists = safe_find_all(d, By.CSS_SELECTOR, '[class*=eventhelper_] [class*=elist], [class*=eventhelper_] [class*=eventlist]')
    for elist in lists:
        if not is_visible(d, elist):
            continue
        items = elist.find_elements(By.CSS_SELECTOR, 'div[class*=compatibility_viewer_item], [class*=eventhelper_item], [class*=event_item]')
        for it in items:
            if not is_visible(d, it):
                continue
            ev_name = txt(it)
            if not ev_name:
                continue
            pop = tippy_show_and_get_popper(d, it)
            try:
                rows = parse_event_from_tippy_popper(pop)
                if rows:
                    for kv in rows:
                        events.append(make_support_card(ev_name, kv, support_slug))
                else:
                    events.append(make_support_card(ev_name, {"(Auto)": "See details"}, support_slug))
            finally:
                tippy_hide(d, it)
    return events

def _open_support_hints_tab(d) -> bool:
    def _click_text(label: str) -> bool:
        xpath = ("//*[self::button or self::a or self::div or self::span]"
                 "[contains(translate(normalize-space(.),"
                 "'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),"
                 f"'{label.lower()}')]")
        for el in safe_find_all(d, By.XPATH, xpath):
            if not is_visible(d, el):
                continue
            try:
                ok = d.execute_script("""
                    const el = arguments[0];
                    if (!el) return false;
                    const inMain = !!el.closest('main');
                    const inHeader = !!el.closest('header');
                    const inNav = !!el.closest('nav');
                    const inFooter = !!el.closest('footer');
                    return inMain && !inHeader && !inNav && !inFooter;
                """, el)
                if not ok:
                    continue
            except Exception:
                pass
            try:
                el.click()
                time.sleep(0.25)
                return True
            except Exception:
                continue
        return False

    # Try tabs that commonly gate the hints section
    return (
        _click_text("support hints")
        or _click_text("skills from events")
        or _click_text("hints")
        or _click_text("skills")
    )

def _merge_support_hints(base: List[Dict[str, Any]], extra: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # Dedupe by name, prefer entries with SkillId
    by_name: Dict[str, Dict[str, Any]] = {}
    for h in base + extra:
        if not isinstance(h, dict):
            continue
        name = (h.get("Name") or "").strip()
        if not name:
            continue
        key = name.lower()
        cur = by_name.get(key)
        if not cur:
            by_name[key] = h
            continue
        cur_id = str(cur.get("SkillId") or "")
        new_id = str(h.get("SkillId") or "")
        if not cur_id and new_id:
            by_name[key] = h
    return list(by_name.values())

def _open_events_tab(d) -> bool:
    def _click_text(label: str) -> bool:
        xpath = ("//*[self::button or self::a or self::div or self::span]"
                 "[contains(translate(normalize-space(.),"
                 "'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),"
                 f"'{label.lower()}')]")
        for el in safe_find_all(d, By.XPATH, xpath):
            if not is_visible(d, el):
                continue
            try:
                ok = d.execute_script("""
                    const el = arguments[0];
                    if (!el) return false;
                    const inMain = !!el.closest('main');
                    const inHeader = !!el.closest('header');
                    const inNav = !!el.closest('nav');
                    const inFooter = !!el.closest('footer');
                    return inMain && !inHeader && !inNav && !inFooter;
                """, el)
                if not ok:
                    continue
            except Exception:
                pass
            try:
                el.click()
                time.sleep(0.25)
                return True
            except Exception:
                continue
        return False

    return _click_text("events") or _click_text("event")

def _open_character_events_tab(d) -> bool:
    return _open_events_tab(d)

def _parse_objectives_from_json(objective_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Parse objectives from the new JSON structure."""
    objectives: List[Dict[str, Any]] = []
    if not objective_data:
        return objectives

    for obj in objective_data:
        if not isinstance(obj, dict):
            continue

        # Get race info
        races = obj.get("races") or []
        race_names = []
        for race in races:
            if isinstance(race, dict):
                race_name = race.get("name_en") or race.get("name") or ""
                if race_name:
                    race_names.append(race_name)

        objective_name = ", ".join(race_names) if race_names else f"Objective {obj.get('order', '?')}"

        # Parse turn to schedule
        turn = obj.get("turn", 0)
        cond_type = obj.get("cond_type", "")
        cond_value = obj.get("cond_value", "")

        # Convert turn to year/period
        if turn <= 24:
            year = "Junior Year"
        elif turn <= 48:
            year = "Classic Year"
        else:
            year = "Senior Year"

        objectives.append({
            "ObjectiveName": objective_name,
            "Turn": str(turn),
            "Time": year,
            "ObjectiveCondition": f"{cond_type}: {cond_value}" if cond_type else ""
        })

    return objectives

def _parse_stats_from_json(item_data: Dict[str, Any]) -> Tuple[Dict, Dict, Dict]:
    """Parse base stats, stat bonuses, and aptitudes from JSON."""
    base_stats: Dict = {}
    stat_bonuses: Dict = {}
    aptitudes: Dict = {}

    # Base stats - usually in arrays like [speed, stamina, power, guts, wit]
    stat_names = ["Speed", "Stamina", "Power", "Guts", "Wit"]
    stat_key_map = {
        "speed": "Speed", "spd": "Speed",
        "stamina": "Stamina", "sta": "Stamina",
        "power": "Power", "pow": "Power",
        "guts": "Guts", "gut": "Guts",
        "wit": "Wit", "wis": "Wit", "wisdom": "Wit", "int": "Wit", "intelligence": "Wit",
    }

    def _normalize_stat_key(k: str) -> str:
        return stat_key_map.get((k or "").strip().lower(), k)

    def _stats_from_value(v: Any) -> Dict[str, Any]:
        if isinstance(v, list):
            return {stat_names[i]: v[i] for i in range(min(len(stat_names), len(v)))}
        if isinstance(v, dict):
            out = {}
            for k, val in v.items():
                nk = _normalize_stat_key(str(k))
                if nk in stat_names and val is not None:
                    out[nk] = val
            return out
        return {}

    three_star = item_data.get("status_3") or item_data.get("base_stats_3") or item_data.get("status3") or []
    five_star = item_data.get("status_5") or item_data.get("base_stats_5") or item_data.get("status5") or item_data.get("status") or []

    three_stats = _stats_from_value(three_star)
    five_stats = _stats_from_value(five_star)
    if three_stats:
        base_stats["3★"] = three_stats
    if five_stats:
        base_stats["5★"] = five_stats

    # Stat bonuses / growths
    bonus_data = (
        item_data.get("bonus")
        or item_data.get("stat_bonus")
        or item_data.get("stat_bonus_rate")
        or item_data.get("growth")
        or item_data.get("growth_rate")
        or item_data.get("growths")
        or item_data.get("stat_growth")
        or item_data.get("stats_growth")
        or []
    )
    if isinstance(bonus_data, list):
        for i, val in enumerate(bonus_data):
            if i < len(stat_names):
                stat_bonuses[stat_names[i]] = val or 0
    elif isinstance(bonus_data, dict):
        for k, val in bonus_data.items():
            nk = _normalize_stat_key(str(k))
            if nk in stat_names:
                stat_bonuses[nk] = val or 0

    # Aptitudes - [turf, dirt, short, mile, medium, long, front, pace, late, end]
    apt_data = item_data.get("apt") or item_data.get("aptitude") or item_data.get("aptitudes") or []
    if isinstance(apt_data, list) and len(apt_data) >= 10:
        aptitudes["Surface"] = {"Turf": apt_data[0], "Dirt": apt_data[1]}
        aptitudes["Distance"] = {"Short": apt_data[2], "Mile": apt_data[3], "Medium": apt_data[4], "Long": apt_data[5]}
        aptitudes["Strategy"] = {"Front": apt_data[6], "Pace": apt_data[7], "Late": apt_data[8], "End": apt_data[9]}
    elif isinstance(apt_data, dict):
        surface = apt_data.get("surface") or apt_data.get("Surface") or {}
        distance = apt_data.get("distance") or apt_data.get("Distance") or {}
        strategy = apt_data.get("strategy") or apt_data.get("Strategy") or {}
        if surface: aptitudes["Surface"] = surface
        if distance: aptitudes["Distance"] = distance
        if strategy: aptitudes["Strategy"] = strategy

    return base_stats, stat_bonuses, aptitudes

def _normalize_strategy_names(aptitudes: Dict) -> Dict:
    if not aptitudes or "Strategy" not in aptitudes:
        return aptitudes
    strat = aptitudes.get("Strategy") or {}
    if not isinstance(strat, dict):
        return aptitudes
    remapped = {}
    for k, v in strat.items():
        if k == "Stalker":
            remapped["Pace"] = v
        elif k == "Mid":
            remapped["Late"] = v
        else:
            remapped[k] = v
    aptitudes["Strategy"] = remapped
    return aptitudes

def _parse_base_stats_from_page(d) -> Dict:
    cap = _get_caption_el(d, "Base stats")
    blocks = _stats_blocks_after_caption(d, cap)
    out: Dict = {}
    for b in blocks:
        parsed = _parse_base_stats_from_block(b)
        if parsed:
            out[f"{parsed['stars']}★"] = parsed["stats"]
    return out

def _parse_stat_bonuses_from_page(d) -> Dict:
    cap = _get_caption_el(d, "Stat bonuses")
    blocks = _stats_blocks_after_caption(d, cap)
    if blocks:
        return _parse_stat_bonuses(blocks[0])
    return {}

def _parse_aptitudes_from_page(d) -> Dict:
    cap = _get_caption_el(d, "Aptitude")
    blocks = _stats_blocks_after_caption(d, cap)
    return _parse_aptitudes(blocks)

def _parse_height_from_page(d) -> Optional[int]:
    raw = _label_value(d, "Height") or _label_value(d, "Height (cm)")
    m = re.search(r"(\d+)", raw or "")
    return int(m.group(1)) if m else None

def _parse_sizes_from_item(item_data: Dict[str, Any]) -> Dict:
    for key in ("three_sizes", "three_size", "threeSizes", "sizes"):
        v = item_data.get(key)
        if isinstance(v, dict):
            b = v.get("B") or v.get("bust")
            w = v.get("W") or v.get("waist")
            h = v.get("H") or v.get("hip")
            if b and w and h:
                return {"B": b, "W": w, "H": h}
        if isinstance(v, list) and len(v) >= 3:
            return {"B": v[0], "W": v[1], "H": v[2]}
        if isinstance(v, str):
            parsed = _parse_three_sizes(v)
            if parsed:
                return parsed
    if item_data.get("bust") and item_data.get("waist") and item_data.get("hip"):
        return {"B": item_data["bust"], "W": item_data["waist"], "H": item_data["hip"]}
    return {}

def scrape_characters(save_path: str, server: str, headless: bool = True,
                      events_source: str = "merge"):
    store = JsonListStore(save_path, match_key="UmaKey", flush_every=20)
    events_source = (events_source or "merge").lower()
    d = new_driver(headless=headless)
    try:
        with_retries(nav, d, "https://gametora.com/umamusume/characters", "body")
        ensure_server(d, server=server, keep_raw_en=True)
        time.sleep(1)  # Wait for page to fully load
        thumbs_dir = os.path.join("public", "assets", "character_thumbs")
        _scroll_page_until_stable(d)
        time.sleep(0.5)
        previews = collect_character_previews(d, thumbs_dir)

        page_props = safe_get_page_props(d)
        items = _extract_items_by_keys(page_props, ("items", "characters", "umas", "charas", "list"))
        urls = _collect_urls_from_items(items, _build_character_url) if items else []
        urls = [u for u in urls if not _is_character_profile_url(u)]

        if not urls:
            _scroll_page_until_stable(d)
            time.sleep(0.5)
            anchors = safe_find_all(d, By.CSS_SELECTOR, "a[href*='/umamusume/characters/']")
            anchors = filter_visible(d, anchors)
            seen = set()
            for a in anchors:
                href = a.get_attribute("href") or ""
                if not href:
                    continue
                if re.search(r"/umamusume/characters/?$", href):
                    continue
                if _is_character_profile_url(href):
                    continue
                if "/umamusume/characters/" in href and href not in seen:
                    seen.add(href)
                    urls.append(href)

        urls = list(dict.fromkeys(urls))
        total = len(urls)

        if total == 0:
            print("[character] No character links found; site layout may have changed.")
            return

        print(f"[character] Found {total} character URLs to scrape")

        for i, url in enumerate(urls, 1):
            for attempt in range(RETRIES + 1):
                try:
                    if _is_character_profile_url(url):
                        print(f"[{i}/{total}] UMA skip non-character page: {url}")
                        break
                    ok = with_retries(nav, d, url, "body")
                    slug, uma_id = _slug_and_id_from_url(url)
                    if not ok: raise TimeoutException("no body")

                    time.sleep(0.5)  # Wait for JS to load
                    preview = previews.get(slug) if slug in previews else (previews.get(str(uma_id)) if uma_id else None)
                    preview_img = preview.get("UmaImage") if preview else ""

                    # Try to get data from __NEXT_DATA__ JSON first
                    page_props = safe_get_page_props(d)

                    if page_props:
                        # New JSON-based extraction
                        item_data = page_props.get("itemData", {})
                        event_data = (
                            page_props.get("eventData")
                            or page_props.get("events")
                            or page_props.get("event")
                            or page_props.get("event_data")
                            or item_data.get("eventData")
                            or item_data.get("events")
                            or item_data.get("event")
                            or {}
                        )
                        objective_data = page_props.get("objectiveData", [])

                        # Get character name
                        name = item_data.get("name_en") or item_data.get("name") or ""
                        if not name:
                            # Fallback to DOM
                            name_el = safe_find(d, By.CSS_SELECTOR, "h1, [class*='name']")
                            name = (txt(name_el) or "").replace("\n", "")

                        if not name:
                            raise WebDriverException("Missing character name")

                        nickname = item_data.get("title_en") or item_data.get("title") or ""
                        uma_key = _make_uma_key(name, nickname, slug)

                        # Parse stats (JSON first, DOM fallback)
                        base_stats, stat_bonuses, aptitudes = _parse_stats_from_json(item_data)
                        if not base_stats:
                            base_stats = _parse_base_stats_from_page(d)
                        if not stat_bonuses:
                            stat_bonuses = _parse_stat_bonuses_from_page(d)
                        if not aptitudes:
                            aptitudes = _parse_aptitudes_from_page(d)
                        aptitudes = _normalize_strategy_names(aptitudes)

                        # Get base stars from rarity field
                        base_stars = item_data.get("rarity") or item_data.get("stars") or 0

                        # Height and sizes
                        height_cm = item_data.get("height") or item_data.get("height_cm") or item_data.get("heightCm") or None
                        if height_cm is None:
                            height_cm = _parse_height_from_page(d)
                        sizes = _parse_sizes_from_item(item_data)
                        if not sizes:
                            sizes = _parse_three_sizes(_label_value(d, "Three sizes") or _label_value(d, "Three Sizes"))

                        # Parse objectives
                        objectives = _parse_objectives_from_json(objective_data)

                        # Parse events
                        events_json = _parse_events_from_json(event_data, lang="en") if event_data else []
                        events_dom: List[Dict[str, Any]] = []
                        if events_source in ("dom", "merge") or (events_source == "json" and not events_json):
                            _open_events_tab(d)
                            events_dom = _parse_event_helper_events_from_page(d)
                        if events_source == "dom":
                            events = events_dom or events_json
                        elif events_source == "merge":
                            events = _merge_event_entries(events_json, events_dom) if events_dom else events_json
                        else:
                            events = events_json or events_dom

                        img_url = _find_character_image_url(d, item_data)
                        if preview_img:
                            img_local = preview_img
                        else:
                            img_local = _save_character_image(img_url, thumbs_dir, uma_id, name) if img_url else ""

                    else:
                        # Fallback to old DOM-based parsing (may not work with new UI)
                        print(f"  [warn] No __NEXT_DATA__ found for {url}, trying DOM fallback...")

                        name_el = safe_find(d, By.CSS_SELECTOR, 'h1, div[class*=character] [class*=name]')
                        name = (txt(name_el) or "").replace("\n", "")
                        if not name:
                            raise WebDriverException("Missing character name")

                        nickname, base_stars = _parse_top_meta(d)
                        uma_key = _make_uma_key(name, nickname, slug)

                        base_stats = _parse_base_stats_from_page(d)
                        stat_bonuses = _parse_stat_bonuses_from_page(d)
                        aptitudes = _normalize_strategy_names(_parse_aptitudes_from_page(d))
                        height_cm = _parse_height_from_page(d)
                        sizes = _parse_three_sizes(_label_value(d, "Three sizes") or _label_value(d, "Three Sizes"))
                        objectives = []
                        events_json = []
                        events_dom: List[Dict[str, Any]] = []
                        if events_source in ("dom", "merge") or events_source == "json":
                            _open_events_tab(d)
                            events_dom = _parse_event_helper_events_from_page(d)
                        events = events_dom or events_json
                        img_url = _find_character_image_url(d, {})
                        if preview_img:
                            img_local = preview_img
                        else:
                            img_local = _save_character_image(img_url, thumbs_dir, uma_id, name) if img_url else ""

                    # --- Upsert record ---
                    upsert_json_item(store, "UmaKey", uma_key, {
                        "UmaKey": uma_key,
                        "UmaName": name,
                        "UmaNickname": nickname or None,
                        "UmaSlug": slug,
                        "UmaId": uma_id,
                        "UmaBaseStars": base_stars or None,
                        "UmaBaseStats": base_stats,
                        "UmaStatBonuses": stat_bonuses,
                        "UmaAptitudes": aptitudes,
                        "UmaHeightCm": height_cm,
                        "UmaThreeSizes": sizes,
                        "UmaObjectives": objectives,
                        "UmaEvents": events,
                        "UmaImage": img_local or img_url or None
                    })

                    print(f"[{i}/{total}] UMA ✓ {name} ({nickname or slug or 'default'})  "
                        f"(★{base_stars} | base:{'/'.join(base_stats.keys()) or '-'} "
                        f"| bonuses:{len(stat_bonuses)} | apt:{len(aptitudes)} "
                        f"| {len(objectives)} objectives, {len(events)} events)")
                    break

                except (TimeoutException, WebDriverException, StaleElementReferenceException, ReadTimeoutError) as e:
                    if attempt < RETRIES:
                        try: d.quit()
                        except Exception: pass
                        d = new_driver(headless=headless)
                        with_retries(nav, d, "https://gametora.com/umamusume/characters", "body")
                        ensure_server(d, server=server, keep_raw_en=True)
                        continue
                    else:
                        print(f"[{i}/{total}] UMA ERROR {url}: {e}")
                        break

        store.write()
        _summarize_characters(store)
    finally:
        try: d.quit()
        except Exception: pass


def scrape_supports(out_events_path: str, out_hints_path: str, server: str, headless: bool = True,
                    thumbs_dir: str = "public/assets/support_thumbs", workers: int = 2,
                    min_interval: float = 0.9, jitter: float = 0.25,
                    events_source: str = "merge"):
    return scrape_supports_threaded(
        out_events_path,
        out_hints_path,
        server=server,
        headless=headless,
        thumbs_dir=thumbs_dir,
        workers=workers,
        min_interval=min_interval,
        jitter=jitter,
        events_source=events_source
    )
    d = new_driver(headless=headless)
    try:
        with_retries(nav, d, "https://gametora.com/umamusume/supports", "main main")
        ensure_server(d, server=server, keep_raw_en=True)

        # NEW: collect preview thumbnails by slug/id once
        previews = collect_support_previews(d, thumbs_dir)

        cards = _wait_support_cards(d)
        if not cards:
            _scroll_page_until_stable(d)
            cards = _wait_support_cards(d, timeout_s=4.0)
        urls = []
        for a in cards:
            try:
                inner = a.find_element(By.CSS_SELECTOR, "div")
                if not is_visible(d, inner): continue
            except Exception:
                pass
            href = a.get_attribute("href") or ""
            if href and href not in urls:
                urls.append(href)

        total = len(urls)
        if total == 0:
            print("[support] No support cards found on list page; site layout may have changed.")
        for i, url in enumerate(urls, 1):
            for attempt in range(RETRIES + 1):
                try:
                    ok = with_retries(nav, d, url, "body")
                    if not ok:
                        raise TimeoutException("no body")

                    slug, sup_id = _slug_and_id_from_url(url)

                    name_el = safe_find(d, By.CSS_SELECTOR, 'h1, div[class*=supports_infobox_] [class*="name"], [class*="support_name"]')
                    sname = txt(name_el) or url.rstrip("/").split("/")[-1]

                    m = re.search(r"\((SSR|SR|R)\)", sname, flags=re.I)
                    rarity = m.group(1).upper() if m else "UNKNOWN"

                    # Always define this before event parsing so the print never errors
                    added = 0

                    # ----- parse hints (as before) -----
                    hints = parse_support_hints_on_page(d)

                    # ----- choose/download image (as before) -----
                    img_url = ""
                    if slug in previews:
                        img_url = previews[slug].get("SupportImage", "") or ""
                        if not sup_id:
                            sup_id = previews[slug].get("SupportId", None)
                    if not img_url:
                        big = safe_find(d, By.CSS_SELECTOR, "img[src*='/images/umamusume/supports/']")
                        src = _abs_url(d, big.get_attribute("src") or "") if big else ""
                        img_url = _save_thumb(src, thumbs_dir, slug, sup_id)

                    # ----- parse events (optional) -----
                    card_events = []
                    for elist in safe_find_all(d, By.CSS_SELECTOR, 'div[class*=eventhelper_elist]'):
                        if not is_visible(d, elist):
                            continue
                        for it in elist.find_elements(By.CSS_SELECTOR, 'div[class*=compatibility_viewer_item]'):
                            if not is_visible(d, it):
                                continue
                            ev_name = txt(it)
                            if not ev_name:
                                continue
                            pop = tippy_show_and_get_popper(d, it)
                            try:
                                rows = parse_event_from_tippy_popper(pop)
                                for kv in rows:
                                    evt = make_support_card(ev_name, kv, support_slug=slug)
                                    card_events.append(evt)
                                    if append_json_item(
                                        out_events_path,
                                        evt,
                                        dedup_key=("EventName", "EventOptions")
                                    ):
                                        added += 1
                            finally:
                                tippy_hide(d, it)

                    # ----- merge event hints into support hints -----
                    event_hint_names = _extract_hint_names_from_events(card_events)
                    hints = _merge_event_hints_into_support_hints(hints, event_hint_names)

                    # ----- upsert hints (slug-keyed) -----
                    upsert_json_item(out_hints_path, "SupportSlug", slug or sname, {
                        "SupportSlug": slug or sname,
                        "SupportId": sup_id,
                        "SupportName": sname,
                        "SupportRarity": rarity,
                        "SupportImage": img_url,
                        "SupportHints": hints,
                    })

                    print(f"[{i}/{total}] SUPPORT ✓ {sname} (slug:{slug or '-'} id:{sup_id or '-'} "
                        f"+{added} events, {len(hints)} hints)")
                    break

                except (TimeoutException, WebDriverException, StaleElementReferenceException, ReadTimeoutError) as e:
                    if attempt < RETRIES:
                        try: d.quit()
                        except Exception: pass
                        d = new_driver(headless=headless)
                        with_retries(nav, d, "https://gametora.com/umamusume/supports", "main main")
                        ensure_server(d, server=server, keep_raw_en=True)
                        # rebuild previews after driver restart
                        previews = collect_support_previews(d, thumbs_dir)
                        continue
                    else:
                        print(f"[{i}/{total}] SUPPORT ERROR {url}: {e}")
                        break
    finally:
        try: d.quit()
        except Exception: pass


def _parse_support_events_from_json(event_data: Dict[str, Any], lang: str = "en") -> List[Dict[str, Any]]:
    """Parse support card events from JSON (all categories)."""
    return _parse_events_from_json(event_data, lang=lang)

def _parse_support_hints_from_json(item_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Parse support hints/skills from JSON."""
    hints: List[Dict[str, Any]] = []

    hints_data = item_data.get("hints", {})
    if not hints_data:
        return hints

    # hint_skills may be list of IDs or objects
    name_map = _load_skill_name_map()
    hint_skills = hints_data.get("hint_skills", [])
    for skill_entry in hint_skills:
        lvl = None
        if isinstance(skill_entry, dict):
            sid = (
                skill_entry.get("id")
                or skill_entry.get("skill_id")
                or skill_entry.get("skillId")
                or skill_entry.get("sid")
            )
            lvl = (
                skill_entry.get("hint_level")
                or skill_entry.get("hint_lv")
                or skill_entry.get("level")
            )
        else:
            sid = skill_entry
        sid = str(sid) if sid is not None else ""
        if not sid:
            continue
        hints.append({
            "SkillId": sid,
            "Name": name_map.get(sid, ""),
            "HintLevel": int(lvl) if isinstance(lvl, (int, float, str)) and str(lvl).isdigit() else None
        })

    # hint_others contains stat bonuses like "Speed +6"
    hint_others = hints_data.get("hint_others", [])
    for other in hint_others:
        if isinstance(other, str):
            hints.append({
                "SkillId": "",
                "Name": other,
                "HintLevel": None
            })
        elif isinstance(other, dict):
            name = other.get("name") or other.get("n") or other.get("label") or ""
            lvl = other.get("hint_level") or other.get("hint_lv") or other.get("level")
            if name:
                hints.append({
                    "SkillId": "",
                    "Name": name,
                    "HintLevel": int(lvl) if isinstance(lvl, (int, float, str)) and str(lvl).isdigit() else None
                })

    return hints

def _scrape_support_detail(d, url: str, previews: dict, thumbs_dir: str,
                           events_store: JsonListStore, hints_store: JsonListStore,
                           events_source: str = "merge") -> tuple[str, str, Optional[str], int, int]:
    slug, sup_id = _slug_and_id_from_url(url)

    time.sleep(0.3)  # Wait for page to load

    # Try to get data from __NEXT_DATA__ JSON first
    page_props = safe_get_page_props(d)
    events_source = (events_source or "merge").lower()
    events_json: List[Dict[str, Any]] = []
    events_dom: List[Dict[str, Any]] = []

    if page_props:
        # New JSON-based extraction
        item_data = page_props.get("itemData", {})
        event_data = (
            page_props.get("eventData")
            or page_props.get("events")
            or page_props.get("event")
            or page_props.get("event_data")
            or item_data.get("eventData")
            or item_data.get("events")
            or item_data.get("event")
            or {}
        )

        # Get support card name
        sname = item_data.get("name_en") or item_data.get("name") or ""
        if not sname:
            # Fallback to DOM
            name_el = safe_find(d, By.CSS_SELECTOR, "h1, [class*='name']")
            sname = txt(name_el) or url.rstrip("/").split("/")[-1]

        # Get rarity from JSON
        rarity_map = {1: "R", 2: "SR", 3: "SSR"}
        rarity_num = item_data.get("rarity") or 0
        rarity = rarity_map.get(rarity_num, "UNKNOWN")

        # If rarity not in JSON, try to parse from name
        if rarity == "UNKNOWN":
            m = re.search(r"\((SSR|SR|R)\)", sname, flags=re.I)
            rarity = m.group(1).upper() if m else "UNKNOWN"

        # Get support ID from JSON if not from URL
        if not sup_id:
            sup_id = str(item_data.get("id") or item_data.get("support_id") or "")

        # Parse hints from JSON first, then enrich from DOM (includes "Skills from events")
        hints = _parse_support_hints_from_json(item_data)
        _open_support_hints_tab(d)
        dom_hints = parse_support_hints_on_page(d)
        if dom_hints:
            hints = _merge_support_hints(hints, dom_hints)

        # Merge event_skills from JSON (skill IDs obtainable through events)
        event_skill_ids = item_data.get("event_skills", [])
        if isinstance(event_skill_ids, list) and event_skill_ids:
            name_map = _load_skill_name_map()
            event_hint_names = [name_map.get(str(sid), "") for sid in event_skill_ids]
            event_hint_names = [n for n in event_hint_names if n]
            hints = _merge_event_hints_into_support_hints(hints, event_hint_names)

        # Parse events from JSON
        events_json = _parse_events_from_json(event_data, lang="en", support_slug=slug) if event_data else []

    else:
        # Fallback to DOM-based parsing
        print(f"  [warn] No __NEXT_DATA__ found for {url}, trying DOM fallback...")

        name_el = safe_find(d, By.CSS_SELECTOR, 'h1, div[class*=support] [class*="name"]')
        sname = txt(name_el) or url.rstrip("/").split("/")[-1]

        m = re.search(r"\((SSR|SR|R)\)", sname, flags=re.I)
        rarity = m.group(1).upper() if m else "UNKNOWN"

        _open_support_hints_tab(d)
        hints = parse_support_hints_on_page(d)
        events_json = []

    # Optional DOM event parsing for completeness
    if events_source in ("dom", "merge") or (events_source == "json" and not events_json):
        _open_events_tab(d)
        events_dom = _parse_event_helper_events_from_page(d, support_slug=slug)

    if events_source == "dom":
        events = events_dom or events_json
    elif events_source == "merge":
        events = _merge_event_entries(events_json, events_dom) if events_dom else events_json
    else:
        events = events_json or events_dom

    # Handle image
    img_url = ""
    preview = previews.get(slug) or (sup_id and previews.get(str(sup_id)))
    if preview:
        img_url = preview.get("SupportImage", "") or ""
        if not sup_id:
            sup_id = preview.get("SupportId", None)
    if not img_url:
        big = safe_find(d, By.CSS_SELECTOR, "img[src*='/images/umamusume/supports/']")
        src = _abs_url(d, big.get_attribute("src") or "") if big else ""
        img_url = _save_thumb(src, thumbs_dir, slug, sup_id)

    # Save events
    added = 0
    for evt in events:
        if not isinstance(evt, dict):
            continue
        if append_json_item(events_store, evt, dedup_key=("EventName", "EventOptions")):
            added += 1

    # Merge event-derived hints into SupportHints
    event_hint_names = _extract_hint_names_from_events(events)
    hints = _merge_event_hints_into_support_hints(hints, event_hint_names)

    # Upsert hints
    upsert_json_item(hints_store, "SupportSlug", slug or sname, {
        "SupportSlug": slug or sname,
        "SupportId": sup_id,
        "SupportName": sname,
        "SupportRarity": rarity,
        "SupportImage": img_url,
        "SupportHints": hints,
    })

    return sname, slug, sup_id, added, len(hints)


def scrape_supports_threaded(out_events_path: str, out_hints_path: str, server: str, headless: bool = True,
                             thumbs_dir: str = "public/assets/support_thumbs", workers: int = 2,
                             min_interval: float = 0.9, jitter: float = 0.25,
                             events_source: str = "merge") -> None:
    events_store = JsonListStore(out_events_path, dedup_key=("EventName", "EventOptions"), flush_every=100)
    hints_store = JsonListStore(out_hints_path, match_key="SupportSlug", flush_every=25)
    d = new_driver(headless=headless)
    try:
        with_retries(nav, d, "https://gametora.com/umamusume/supports", "body")
        ensure_server(d, server=server, keep_raw_en=True)
        time.sleep(1)  # Wait for JS to load

        page_props = safe_get_page_props(d)
        items = _extract_items_by_keys(page_props, ("items", "supports", "supportCards", "support_cards", "supportList"))
        previews = collect_support_previews_from_items(items, thumbs_dir) if items else {}
        urls = _collect_urls_from_items(items, _build_support_url) if items else []

        if not urls:
            # Scroll to load all cards
            _scroll_page_until_stable(d)
            time.sleep(0.5)

            cards = _wait_support_cards(d)
            if not cards:
                _scroll_page_until_stable(d)
                cards = _wait_support_cards(d, timeout_s=4.0)

            urls = []
            seen = set()
            for a in cards:
                href = a.get_attribute("href") or ""
                if not href:
                    continue
                if re.search(r"/umamusume/supports/?$", href):
                    continue
                if "/umamusume/supports/" in href and href not in seen:
                    seen.add(href)
                    urls.append(href)

        if not previews:
            previews = collect_support_previews(d, thumbs_dir)

        total = len(urls)
        if total == 0:
            print("[support] No support cards found on list page; site layout may have changed.")
            events_store.write()
            hints_store.write()
            _summarize_supports(events_store, hints_store)
            return

        print(f"[support] Found {total} support card URLs to scrape")
    finally:
        try: d.quit()
        except Exception: pass

    worker_count = max(1, min(int(workers), total))
    rate_limiter = RateLimiter(min_interval_s=min_interval, jitter_s=jitter)
    q = queue.Queue()
    for i, url in enumerate(urls, 1):
        q.put((i, url))

    def worker_loop(worker_id: int) -> None:
        d_local = new_driver(headless=headless)
        try:
            with_retries(nav, d_local, "https://gametora.com/umamusume/supports", "main main")
            ensure_server(d_local, server=server, keep_raw_en=True)
            while True:
                try:
                    idx, url = q.get_nowait()
                except queue.Empty:
                    return
                try:
                    for attempt in range(RETRIES + 1):
                        try:
                            rate_limiter.wait()
                            ok = with_retries(nav, d_local, url, "body")
                            if not ok:
                                raise TimeoutException("no body")
                            sname, slug, sup_id, added, hint_count = _scrape_support_detail(
                                d_local, url, previews, thumbs_dir, events_store, hints_store, events_source
                            )
                            print(f"[{idx}/{total}] SUPPORT {sname} (slug:{slug or '-'} id:{sup_id or '-'} "
                                  f"+{added} events, {hint_count} hints)")
                            break
                        except (TimeoutException, WebDriverException, StaleElementReferenceException, ReadTimeoutError) as e:
                            if attempt < RETRIES:
                                try: d_local.quit()
                                except Exception: pass
                                d_local = new_driver(headless=headless)
                                with_retries(nav, d_local, "https://gametora.com/umamusume/supports", "main main")
                                ensure_server(d_local, server=server, keep_raw_en=True)
                                time.sleep(0.5 * (2 ** attempt))
                                continue
                            else:
                                print(f"[{idx}/{total}] SUPPORT ERROR {url}: {e}")
                                break
                finally:
                    q.task_done()
        finally:
            try: d_local.quit()
            except Exception: pass

    threads = []
    for wid in range(worker_count):
        t = threading.Thread(target=worker_loop, args=(wid,), daemon=True)
        t.start()
        threads.append(t)

    q.join()
    for t in threads:
        t.join()

    events_store.write()
    hints_store.write()
    _summarize_supports(events_store, hints_store)


def scrape_career(save_path: str, server: str, headless: bool = True):
    store = JsonListStore(save_path, dedup_key=("EventName", "EventOptions"), flush_every=100)
    d = new_driver(headless=headless)
    try:
        with_retries(nav, d, "https://gametora.com/umamusume/training-event-helper", "body")
        time.sleep(1)  # Wait for JS to load

        # Pre-set deck
        d.execute_script('localStorage.setItem("u-eh-d1","[\\"Deck 1\\",106101,1,30024,30024,30009,30024,30009,30008]")')
        d.refresh()
        time.sleep(1)
        ensure_server(d, server=server, keep_raw_en=True)

        # Find scenario dropdown - try multiple selectors
        scenario_btn = safe_find(d, By.CSS_SELECTOR, "#boxScenario") or safe_find(d, By.XPATH, "//*[contains(text(), 'Scenario')]")
        if scenario_btn:
            try: scenario_btn.click()
            except Exception: pass
            time.sleep(DELAY)

        # Find scenario entries - use more flexible selectors
        scenario_entries = safe_find_all(d, By.CSS_SELECTOR, '[data-tippy-root] > div > div > div')
        if not scenario_entries:
            scenario_entries = safe_find_all(d, By.CSS_SELECTOR, 'div[role="tooltip"] > div')

        total = len(scenario_entries)
        print(f"[career] Found {total} scenario entries")

        for idx in range(total):
            # Re-open dropdown each iteration
            scenario_btn = safe_find(d, By.CSS_SELECTOR, "#boxScenario") or safe_find(d, By.XPATH, "//*[contains(text(), 'Scenario')]")
            if scenario_btn:
                try: scenario_btn.click()
                except Exception: pass
                time.sleep(DELAY)

            # Re-find entries
            entries = safe_find_all(d, By.CSS_SELECTOR, '[data-tippy-root] > div > div > div')
            if not entries:
                entries = safe_find_all(d, By.CSS_SELECTOR, 'div[role="tooltip"] > div')

            if idx >= len(entries):
                continue

            entry = entries[idx]
            if not entry or not is_visible(d, entry):
                continue

            try: entry.click()
            except Exception: pass
            time.sleep(DELAY)

            # Find filter buttons by ID
            btn = safe_find(d, By.CSS_SELECTOR, f'[id="{idx + 1}"]') or safe_find(d, By.ID, str(idx + 1))
            if btn:
                try: btn.click()
                except Exception: pass
                time.sleep(DELAY)

                added = 0
                # Find event items - use broader selectors
                event_items = safe_find_all(d, By.CSS_SELECTOR, '[class*="event"] [class*="item"]')
                if not event_items:
                    event_items = safe_find_all(d, By.CSS_SELECTOR, '[class*="elist"] > div')

                for it in event_items:
                    if not is_visible(d, it):
                        continue
                    name = txt(it)
                    if not name:
                        continue
                    pop = tippy_show_and_get_popper(d, it)
                    try:
                        for kv in parse_event_from_tippy_popper(pop):
                            if append_json_item(store, make_career(name, kv)):
                                added += 1
                    finally:
                        tippy_hide(d, it)

                print(f"[{idx + 1}/{total}] CAREER +{added} rows")
        store.write()
        _summarize_career(store)
    finally:
        try: d.quit()
        except Exception: pass


def _parse_schedule(year_label: str, month_label: str) -> str:
    year_map = {"First Year": "Junior Year", "Second Year": "Classic Year", "Third Year": "Senior Year"}
    year_text = year_map.get(year_label, year_label)
    from datetime import datetime
    try:
        dt = datetime.strptime(month_label, "%B %d")
        earlylate = "Early" if dt.day == 1 else "Late"
        month_text = f"{earlylate} {dt.strftime('%b')}"
    except Exception:
        month_text = month_label
    return f"{year_text} {month_text}"

def scrape_races(save_path: str, server: str, headless: bool = True):
    store = JsonListStore(save_path, dedup_key=("RaceName", "Schedule", "DistanceMeter"), flush_every=100)
    d = new_driver(headless=headless)
    try:
        with_retries(nav, d, "https://gametora.com/umamusume/races", "body")
        time.sleep(1)  # Wait for JS to load
        ensure_server(d, server=server, keep_raw_en=True)
        time.sleep(0.5)

        # Scroll to load all races
        _scroll_page_until_stable(d)
        time.sleep(0.5)

        # Find race rows - use flexible selectors
        rows = safe_find_all(d, By.CSS_SELECTOR, '[class*="race"] [class*="row"]')
        if not rows:
            rows = safe_find_all(d, By.CSS_SELECTOR, '[class*="list"] > div[class*="row"]')
        if not rows:
            # Try to find any clickable race items
            rows = safe_find_all(d, By.CSS_SELECTOR, 'a[href*="/umamusume/races/"]')

        rows = filter_visible(d, rows)
        total = len(rows)
        print(f"[races] Found {total} race rows")

        for idx, row in enumerate(rows, 1):
            # Find race name - look for text in various locations
            name_el = safe_find(row, By.CSS_SELECTOR, '[class*="name"]') or safe_find(row, By.CSS_SELECTOR, 'div > div:first-child')
            race_name = txt(name_el) if name_el else ""

            if not race_name:
                # If this is a link, try to extract name from the URL or inner text
                if row.tag_name == "a":
                    href = row.get_attribute("href") or ""
                    race_name = txt(row) or href.split("/")[-1].replace("-", " ").title()

            if not race_name:
                print(f"[{idx}/{total}] (skip unnamed race)")
                continue

            if race_name in ("Junior Make Debut", "Junior Maiden Race"):
                item = make_race(
                    race_name, "Junior Year Pre-Debut", "Pre Debut",
                    "Varies", "Varies", "Varies", "Varies", "Varies", "Varies"
                )
                append_json_item(store, item)
                print(f"[{idx}/{total}] {race_name} (special) ✓")
                continue

            # Try to find date info
            date_el = safe_find(row, By.CSS_SELECTOR, '[class*="date"]')
            year = ""
            month = ""
            if date_el and is_visible(d, date_el):
                divs = safe_find_all(date_el, By.CSS_SELECTOR, "div")
                if len(divs) >= 2:
                    year = txt(divs[0])
                    month = txt(divs[1])

            schedule = _parse_schedule(year, month) if (year and month) else "Unknown"

            # Try to find terrain and distance
            terrain = ""
            distance_type = ""
            distance_meter = ""

            # Look for descriptors
            desc_divs = safe_find_all(row, By.CSS_SELECTOR, '[class*="desc"] > div')
            for dv in desc_divs:
                t = txt(dv)
                if "Turf" in t or "Dirt" in t:
                    terrain = "Turf" if "Turf" in t else "Dirt"
                if any(x in t for x in ["Short", "Mile", "Medium", "Long"]):
                    for dt in ["Short", "Mile", "Medium", "Long"]:
                        if dt in t:
                            distance_type = dt
                            break
                if re.search(r"\d{3,4}\s*m", t):
                    m = re.search(r"(\d{3,4})\s*m", t)
                    if m:
                        distance_meter = m.group(1) + "m"

            # Try to click for details
            details_btn = safe_find(row, By.CSS_SELECTOR, '[class*="detail"]') or safe_find(row, By.CSS_SELECTOR, 'button')
            if details_btn and is_visible(d, details_btn):
                try: details_btn.click()
                except Exception: pass
                time.sleep(DELAY)

            dialog = safe_find(d, By.CSS_SELECTOR, 'div[role="dialog"]') or safe_find(d, By.CSS_SELECTOR, '[class*="modal"]')

            grade_text = ""
            season_text = ""
            fans_required = ""
            fans_gained = ""

            if dialog:
                # Extract info from dialog
                dialog_text = txt(dialog)

                # Try to find grade
                grade_match = re.search(r"(G1|G2|G3|OP|Pre-OP|Maiden|Pre Debut)", dialog_text)
                if grade_match:
                    grade_text = grade_match.group(1)

                # Try to find season
                season_match = re.search(r"(Spring|Summer|Autumn|Winter|Fall)", dialog_text)
                if season_match:
                    season_text = season_match.group(1)

                # Try to find fans info
                fans_req_match = re.search(r"Fans required[:\s]*(\d[\d,]*)", dialog_text)
                if fans_req_match:
                    fans_required = fans_req_match.group(1)

                fans_gain_match = re.search(r"Fans gained[:\s]*(\d[\d,]*)", dialog_text)
                if fans_gain_match:
                    fans_gained = fans_gain_match.group(1)

                # Close dialog
                close_btn = safe_find(dialog, By.CSS_SELECTOR, "img, button, [class*='close']")
                if close_btn:
                    try: close_btn.click()
                    except Exception: pass
                time.sleep(DELAY)

            item = make_race(
                race_name, schedule, grade_text or "Unknown", terrain or "Unknown",
                distance_type or "Unknown", distance_meter or "Unknown", season_text or "Unknown",
                fans_required or "Unknown", fans_gained or "Unknown"
            )
            append_json_item(store, item)

            print(f"[{idx}/{total}] {race_name} ✓")
        store.write()
        _summarize_races(store)
    finally:
        try: d.quit()
        except Exception: pass


def _summarize_supports(events_store: JsonListStore, hints_store: JsonListStore) -> None:
    events = events_store.data if events_store else []
    hints = hints_store.data if hints_store else []
    hints_total = sum(len(h.get("SupportHints", [])) for h in hints if isinstance(h, dict))
    no_hints = sum(1 for h in hints if isinstance(h, dict) and not h.get("SupportHints"))
    no_images = sum(1 for h in hints if isinstance(h, dict) and not h.get("SupportImage"))
    print(f"[summary] Supports: {len(hints)} cards, {hints_total} hints, {len(events)} events, "
          f"{no_hints} with 0 hints, {no_images} without image")

def _summarize_characters(store: JsonListStore) -> None:
    data = store.data if store else []
    no_events = sum(1 for h in data if isinstance(h, dict) and not h.get("UmaEvents"))
    no_objectives = sum(1 for h in data if isinstance(h, dict) and not h.get("UmaObjectives"))
    print(f"[summary] Characters: {len(data)} total, {no_events} with 0 events, {no_objectives} with 0 objectives")

def _summarize_career(store: JsonListStore) -> None:
    data = store.data if store else []
    print(f"[summary] Career events: {len(data)} rows")

def _summarize_races(store: JsonListStore) -> None:
    data = store.data if store else []
    unique_names = {h.get("RaceName") for h in data if isinstance(h, dict) and h.get("RaceName")}
    print(f"[summary] Races: {len(data)} rows, {len(unique_names)} unique names")

def _coerce_skill_list(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        for key in ("skills", "items", "data"):
            val = payload.get(key)
            if isinstance(val, list):
                return [row for row in val if isinstance(row, dict)]
    return []

def sync_skills_all(save_path: str, timeout_s: int = 35) -> bool:
    """Download the latest skills metadata into public/assets/skills_all.json."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*",
    }
    candidate_urls: List[str] = []
    manifest_url = "https://gametora.com/data/manifests/umamusume.json"
    try:
        res = requests.get(manifest_url, headers=headers, timeout=timeout_s)
        res.raise_for_status()
        manifest = res.json()
        skill_hash = manifest.get("skills") if isinstance(manifest, dict) else None
        if skill_hash:
            candidate_urls.append(f"https://gametora.com/data/umamusume/skills.{skill_hash}.json")
    except Exception as e:
        print(f"[skills] Warning: failed reading manifest ({manifest_url}): {e}")

    candidate_urls.extend([
        "https://gametora.com/data/umamusume/skills.json",
        "https://gametora.com/loc/umamusume/skills.json",
    ])
    seen: set[str] = set()
    for url in candidate_urls:
        if url in seen:
            continue
        seen.add(url)
        try:
            res = requests.get(url, headers=headers, timeout=timeout_s)
            if res.status_code != 200:
                print(f"[skills] Skip {url} (HTTP {res.status_code})")
                continue
            payload = res.json()
            skills = _coerce_skill_list(payload)
            if not skills:
                print(f"[skills] Skip {url} (no skill list in payload)")
                continue
            _atomic_write(save_path, skills)
            official_count = sum(
                1 for row in skills
                if isinstance(row, dict) and str(row.get("name_en") or "").strip()
            )
            print(
                f"[skills] Wrote {len(skills)} skills to {save_path} "
                f"(official English names: {official_count}) from {url}"
            )
            return True
        except Exception as e:
            print(f"[skills] Failed {url}: {e}")
    print("[skills] Error: unable to download skills metadata from GameTora")
    return False

def main():
    ap = argparse.ArgumentParser(description="GameTora scraper + skills metadata sync")
    ap.add_argument("--out-uma", default="public/assets/uma_data.json", help="Output JSON for characters (objectives/events only)")
    ap.add_argument("--out-supports", default="public/assets/support_card.json", help="Output JSON for support events")
    ap.add_argument("--out-support-hints", default="public/assets/support_hints.json", help="Output JSON for support hint skills")
    ap.add_argument("--out-career", default="public/assets/career.json", help="Output JSON for career events")
    ap.add_argument("--out-races", default="public/assets/races.json", help="Output JSON for races")
    ap.add_argument("--out-skills", default="public/assets/skills_all.json", help="Output JSON for skills metadata")
    ap.add_argument("--thumb-dir", default="public/assets/support_thumbs", help="Where to save support thumbnails")
    ap.add_argument("--what", choices=["skills","uma","supports","career","races","all"], default="all")
    ap.add_argument("--server", choices=["global","japan"], default="global")
    ap.add_argument("--headful", action="store_true")
    ap.add_argument("--supports-workers", type=int, default=2, help="Parallel workers for support scraping (1 disables threading)")
    ap.add_argument("--supports-min-interval", type=float, default=0.9, help="Min seconds between support page navigations across workers")
    ap.add_argument("--supports-jitter", type=float, default=0.25, help="Random jitter added to support navigation delays")
    ap.add_argument("--events-source", choices=["json","dom","merge"], default="merge",
                    help="Event extraction source: json=__NEXT_DATA__, dom=event helper, merge=dom overrides json")
    args = ap.parse_args()
    headless = not args.headful

    try:
        if args.what in ("skills","all"):
            print("\n=== Skills Metadata ===")
            ok = sync_skills_all(args.out_skills)
            if not ok and args.what == "skills":
                sys.exit(1)
        if args.what in ("uma","all"):
            print("\n=== Characters (objectives/events only) ===")
            scrape_characters(args.out_uma, server=args.server, headless=headless, events_source=args.events_source)
        if args.what in ("supports","all"):
            print("\n=== Supports (events + support hints) ===")
            scrape_supports(
                args.out_supports,
                args.out_support_hints,
                server=args.server,
                headless=headless,
                thumbs_dir=args.thumb_dir,
                workers=args.supports_workers,
                min_interval=args.supports_min_interval,
                jitter=args.supports_jitter,
                events_source=args.events_source
            )
        if args.what in ("career","all"):
            print("\n=== Career ===")
            scrape_career(args.out_career, server=args.server, headless=headless)
        if args.what in ("races","all"):
            print("\n=== Races ===")
            scrape_races(args.out_races, server=args.server, headless=headless)
    except WebDriverException as e:
        print(f"[fatal] WebDriver error: {e}", file=sys.stderr); sys.exit(2)

if __name__ == "__main__":
    main()
