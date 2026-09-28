(function () {
  var PAGES = {
    'design-system/ui-audit.html':          { label: 'UI/UX Audit',         section: 'Design System' },
    'design-system/design-system.html':     { label: 'Design System',        section: 'Design System' },
    'design-system/component-library.html': { label: 'Component Library',    section: 'Design System' },
    'design-system/navigation-system.html': { label: 'Navigation System',    section: 'Design System' },
    'design-system/dashboard-2.html':       { label: 'Dashboard Preview',    section: 'Design System' },
    'design-system/brand-guideline.html':   { label: 'Brand Guideline',      section: 'Design System' },
    'design-system/frontend-roadmap.html':  { label: 'Frontend Roadmap',     section: 'Design System' },
    'sales-kit/product-brochure.html':      { label: 'Product Brochure',     section: 'Sales Kit' },
    'sales-kit/feature-matrix.html':        { label: 'Feature Matrix',       section: 'Sales Kit' },
    'solution/solution-overview.html':      { label: 'Solution Overview',    section: 'Solution' },
    'technical/technical-docs.html':        { label: 'Technical Docs',       section: 'Technical' },
  };

  var SECTIONS = {
    'Design System': [
      'design-system/ui-audit.html',
      'design-system/design-system.html',
      'design-system/component-library.html',
      'design-system/navigation-system.html',
      'design-system/dashboard-2.html',
      'design-system/brand-guideline.html',
      'design-system/frontend-roadmap.html',
    ],
    'Sales Kit': [
      'sales-kit/product-brochure.html',
      'sales-kit/feature-matrix.html',
    ],
    'Solution': ['solution/solution-overview.html'],
    'Technical': ['technical/technical-docs.html'],
  };

  // Detect current page key from pathname
  var path = window.location.pathname; // e.g. /preview/design-system/ui-audit.html
  var currentKey = null;
  Object.keys(PAGES).forEach(function (k) {
    if (path.indexOf(k) !== -1) currentKey = k;
  });
  var currentPage = currentKey ? PAGES[currentKey] : null;
  var currentSection = currentPage ? currentPage.section : null;

  // Inject CSS
  var style = document.createElement('style');
  style.textContent = [
    '#_pnav{position:fixed;top:0;left:0;right:0;z-index:9999;background:rgba(6,14,26,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(99,102,241,.18);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px}',
    '#_pnav .pn-inner{display:flex;align-items:center;gap:0;padding:0 20px;height:44px;max-width:1400px;margin:0 auto}',
    '#_pnav .pn-logo{display:flex;align-items:baseline;gap:4px;text-decoration:none;margin-right:16px;flex-shrink:0}',
    '#_pnav .pn-logo b{font-weight:800;color:#f1f5f9;font-size:13px}',
    '#_pnav .pn-logo span{font-weight:500;color:#a5b4fc;font-size:13px}',
    '#_pnav .pn-sep{color:rgba(255,255,255,.2);margin:0 8px;font-size:16px}',
    '#_pnav .pn-breadcrumb{display:flex;align-items:center;gap:0;flex:1;min-width:0}',
    '#_pnav .pn-back{color:#94a3b8;text-decoration:none;white-space:nowrap;transition:color .15s}',
    '#_pnav .pn-back:hover{color:#f1f5f9}',
    '#_pnav .pn-section{color:#a5b4fc;white-space:nowrap}',
    '#_pnav .pn-page{color:#f1f5f9;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#_pnav .pn-nav{display:flex;align-items:center;gap:2px;margin-left:12px;flex-shrink:0}',
    '#_pnav .pn-nav a{color:#94a3b8;text-decoration:none;padding:4px 10px;border-radius:6px;transition:background .15s,color .15s;white-space:nowrap;font-size:12px}',
    '#_pnav .pn-nav a:hover{background:rgba(255,255,255,.07);color:#f1f5f9}',
    '#_pnav .pn-nav a.active{background:rgba(99,102,241,.2);color:#a5b4fc;font-weight:600}',
    '#_pnav .pn-dropdown{position:relative}',
    '#_pnav .pn-dropdown-menu{display:none;position:absolute;top:calc(100% + 6px);right:0;background:#0f1c2e;border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:6px;min-width:190px;box-shadow:0 8px 32px rgba(0,0,0,.5)}',
    '#_pnav .pn-dropdown:hover .pn-dropdown-menu{display:block}',
    '#_pnav .pn-dropdown-menu a{display:block;color:#cbd5e1;text-decoration:none;padding:7px 12px;border-radius:6px;font-size:12px;transition:background .12s,color .12s}',
    '#_pnav .pn-dropdown-menu a:hover{background:rgba(99,102,241,.15);color:#a5b4fc}',
    '#_pnav .pn-dropdown-menu a.active{color:#a5b4fc;font-weight:600}',
    '#_pnav .pn-dropdown-menu .pn-dm-label{color:rgba(148,163,184,.5);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:4px 12px 2px;display:block}',
    'body{padding-top:52px!important}',
  ].join('');
  document.head.appendChild(style);

  // Build nav HTML
  function sectionLinks() {
    return Object.keys(SECTIONS).map(function (sec) {
      var pages = SECTIONS[sec];
      if (pages.length === 1) {
        var href = '/preview/' + pages[0];
        var isActive = currentSection === sec;
        return '<a href="' + href + '"' + (isActive ? ' class="active"' : '') + '>' + sec + '</a>';
      }
      // Dropdown for multi-page sections
      var isActive = currentSection === sec;
      var items = pages.map(function (p) {
        var href = '/preview/' + p;
        var label = PAGES[p] ? PAGES[p].label : p;
        var active = currentKey === p ? ' class="active"' : '';
        return '<a href="' + href + '"' + active + '>' + label + '</a>';
      }).join('');
      return '<div class="pn-dropdown"><a href="#"' + (isActive ? ' class="active"' : '') + ' onclick="return false">' + sec + ' ▾</a><div class="pn-dropdown-menu">' + items + '</div></div>';
    }).join('');
  }

  var breadcrumb = '';
  if (currentPage) {
    breadcrumb = [
      '<a class="pn-back" href="/preview">Preview</a>',
      '<span class="pn-sep">›</span>',
      '<span class="pn-section">' + currentSection + '</span>',
      '<span class="pn-sep">›</span>',
      '<span class="pn-page">' + currentPage.label + '</span>',
    ].join('');
  } else {
    breadcrumb = '<span class="pn-page">Preview</span>';
  }

  var html = [
    '<div id="_pnav">',
    '<div class="pn-inner">',
    '<a class="pn-logo" href="/preview"><b>FADO</b><span>AssetFlow</span></a>',
    '<div class="pn-sep">|</div>',
    '<div class="pn-breadcrumb">' + breadcrumb + '</div>',
    '<nav class="pn-nav">' + sectionLinks() + '</nav>',
    '</div>',
    '</div>',
  ].join('');

  // Insert nav as first child of body
  var wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.insertBefore(wrapper.firstChild, document.body.firstChild);
})();
