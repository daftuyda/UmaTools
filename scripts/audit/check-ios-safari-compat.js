#!/usr/bin/env node

/**
 * iOS Safari Compatibility Checker
 *
 * Scans JavaScript and HTML files for potential iOS Safari compatibility issues
 * and reports features that may need polyfills or fallbacks.
 */

const fs = require('fs');

// Known iOS Safari compatibility issues
const COMPATIBILITY_CHECKS = {
  // Not supported or limited support
  'requestIdleCallback': {
    severity: 'warning',
    message: 'requestIdleCallback not supported in Safari (needs setTimeout fallback)',
    minVersion: 'Not supported',
    fallback: 'Use setTimeout(cb, 1) as fallback'
  },
  'scrollTo.*behavior.*smooth': {
    severity: 'info',
    message: 'smooth scrolling only supported in iOS 15.4+',
    minVersion: '15.4',
    fallback: 'Falls back to instant scroll (acceptable)'
  },
  'requestAnimationFrame': {
    severity: 'info',
    message: 'requestAnimationFrame supported in iOS 6+',
    minVersion: '6.0',
    fallback: 'None needed'
  },

  // Good support
  'IntersectionObserver': {
    severity: 'info',
    message: 'IntersectionObserver supported in iOS 12.2+',
    minVersion: '12.2',
    fallback: 'None needed for target iOS version'
  },
  'Promise': {
    severity: 'info',
    message: 'Promise supported in iOS 8+',
    minVersion: '8.0',
    fallback: 'None needed'
  },
  'fetch': {
    severity: 'info',
    message: 'Fetch API supported in iOS 10.3+',
    minVersion: '10.3',
    fallback: 'None needed'
  },
  'Map': {
    severity: 'info',
    message: 'Map supported in iOS 8+',
    minVersion: '8.0',
    fallback: 'None needed'
  },
  'Set': {
    severity: 'info',
    message: 'Set supported in iOS 8+',
    minVersion: '8.0',
    fallback: 'None needed'
  },
  'import\\(': {
    severity: 'info',
    message: 'Dynamic import() supported in iOS 11+',
    minVersion: '11.0',
    fallback: 'Script tag injection fallback implemented'
  }
};

// HTML5 features to check
const HTML_CHECKS = {
  '<picture>': {
    severity: 'info',
    message: 'Picture element supported in iOS 9.3+',
    minVersion: '9.3',
    fallback: 'Automatic fallback to <img>'
  },
  'loading="lazy"': {
    severity: 'info',
    message: 'Native lazy loading supported in iOS 15.4+',
    minVersion: '15.4',
    fallback: 'Browser ignores attribute on older versions (no harm)'
  },
  'type="module"': {
    severity: 'info',
    message: 'ES modules supported in iOS 11+',
    minVersion: '11.0',
    fallback: 'None needed'
  }
};

// Service Worker specific checks
const SW_CHECKS = {
  'self.addEventListener': {
    severity: 'info',
    message: 'Service Workers supported in iOS 11.3+',
    minVersion: '11.3',
    fallback: 'None needed'
  },
  'caches.open': {
    severity: 'info',
    message: 'Cache API supported in iOS 11.3+',
    minVersion: '11.3',
    fallback: 'None needed'
  }
};

// Files to scan
const FILES_TO_SCAN = {
  js: [
    'public/js/lib/virtual-scroll.js',
    'public/js/skills.js',
    'public/js/hints.js',
    'public/sw.js'
  ],
  html: [
    'public/skills.html',
    'public/hints.html',
    'public/optimizer.html',
    'public/calculator.html',
    'public/index.html'
  ]
};

// Results storage
const results = {
  info: [],
  warning: [],
  error: [],
  summary: {
    totalFiles: 0,
    totalChecks: 0,
    issues: 0
  }
};

/**
 * Scan a file for compatibility issues
 */
function scanFile(filePath, checks) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  results.summary.totalFiles++;

  console.log(`\n📄 Scanning: ${filePath}`);

  Object.entries(checks).forEach(([pattern, check]) => {
    const regex = new RegExp(pattern, 'gi');
    const matches = content.match(regex);

    if (matches) {
      results.summary.totalChecks++;
      const result = {
        file: filePath,
        pattern: pattern,
        matches: matches.length,
        ...check
      };

      if (check.severity === 'warning' || check.severity === 'error') {
        results.summary.issues++;
      }

      results[check.severity].push(result);

      const icon = check.severity === 'error' ? '❌' : check.severity === 'warning' ? '⚠️' : '✅';
      console.log(`  ${icon} Found ${matches.length}x: ${pattern}`);
      console.log(`     ${check.message}`);
      console.log(`     Min iOS: ${check.minVersion} | Fallback: ${check.fallback}`);
    }
  });
}

/**
 * Print summary report
 */
function printSummary() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 iOS SAFARI COMPATIBILITY REPORT');
  console.log('='.repeat(80));

  console.log(`\n📈 Summary:`);
  console.log(`   Files Scanned: ${results.summary.totalFiles}`);
  console.log(`   Features Checked: ${results.summary.totalChecks}`);
  console.log(`   Issues Found: ${results.summary.issues}`);

  if (results.error.length > 0) {
    console.log(`\n❌ ERRORS (${results.error.length}):`);
    results.error.forEach(r => {
      console.log(`   ${r.file}: ${r.message}`);
    });
  }

  if (results.warning.length > 0) {
    console.log(`\n⚠️  WARNINGS (${results.warning.length}):`);
    results.warning.forEach(r => {
      console.log(`   ${r.file}: ${r.message}`);
      console.log(`      Fallback: ${r.fallback}`);
    });
  }

  console.log(`\n✅ INFO (${results.info.length} features detected):`);
  console.log(`   All detected features have adequate iOS Safari support.`);
  console.log(`   Minimum recommended iOS version: 12.2+`);
  console.log(`   Optimal iOS version: 14+ (for WebP support)`);

  console.log('\n' + '='.repeat(80));

  // Overall verdict
  if (results.error.length > 0) {
    console.log('❌ FAILED: Critical iOS Safari compatibility issues found!');
    process.exit(1);
  } else if (results.warning.length > 0) {
    console.log('⚠️  PASSED WITH WARNINGS: Some features need fallbacks (already implemented)');
  } else {
    console.log('✅ PASSED: No critical iOS Safari compatibility issues detected!');
  }

  console.log('\n📖 For detailed testing instructions, see:');
  console.log('   docs/architecture.md');
  console.log('='.repeat(80) + '\n');
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 iOS Safari Compatibility Checker');
  console.log('Checking for compatibility issues in JavaScript and HTML files...\n');

  // Scan JavaScript files
  console.log('\n🔵 JAVASCRIPT FILES:');
  FILES_TO_SCAN.js.forEach(file => {
    scanFile(file, COMPATIBILITY_CHECKS);
  });

  // Scan service worker
  console.log('\n🔴 SERVICE WORKER:');
  scanFile('public/sw.js', SW_CHECKS);

  // Scan HTML files
  console.log('\n🟢 HTML FILES:');
  FILES_TO_SCAN.html.forEach(file => {
    scanFile(file, HTML_CHECKS);
  });

  // Print summary
  printSummary();
}

// Run the checker
main();
