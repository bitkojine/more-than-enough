/* Single source of truth for the game version, SemVer (see CHANGELOG.md).
   Loaded before core.js in index.html; also usable from Node via require. */
var MTE_VERSION = '0.9.1';
if (typeof module !== 'undefined' && module.exports) module.exports = MTE_VERSION;