/* Every element the game talks to, looked up once. */

const byId = (id) => {
  const node = document.getElementById(id);
  if (!node) throw new Error('Missing #' + id + ' in index.html');  // i18n-ok: a bug in the page, for its developers
  return node;
};

export function findElements() {
  return {
    canvas: byId('game'),
    verText: byId('verText'),
    perf: byId('perf'),
    resources: byId('resources'),
    depth: byId('depth'),
    depthGauge: byId('depthGauge'),
    milestone: byId('milestone'),
    awards: byId('btnAwards'),
    settings: byId('btnSettings'),
    settingsPanel: byId('settingsPanel'),
    awardCount: byId('awardCount'),
    action: byId('btnAction'),
    actionIcon: byId('actionIcon'),
    actionLabel: byId('actionLabel'),
    build: byId('btnBuild'),
    upgrade: byId('btnUpgrade'),
    mine: byId('btnMine'),
    mineIcon: byId('mineIcon'),
    mineLabel: byId('mineLabel'),
    zoomIn: byId('btnZoomIn'),
    zoomOut: byId('btnZoomOut'),
    zoomLevel: byId('zoomLevel'),
    zoomText: byId('zoomText'),
    sheet: byId('sheet'),
    sheetGrab: byId('sheetGrab'),
    sheetTitle: byId('sheetTitle'),
    sheetBody: byId('sheetBody'),
    tabs: [...document.querySelectorAll('#tabs .tab')],
    close: byId('btnClose'),
    reset: byId('btnReset'),
    mute: byId('btnMute'),
    muteState: byId('muteState'),
    drag: byId('btnDrag'),
    dragMode: byId('dragMode'),
    toast: byId('toast'),
    textures: byId('btnTextures'),
    packName: byId('packName'),
    texturesDefault: byId('btnTexturesDefault'),
    packFile: byId('packFile'),
    packReport: byId('packReport'),
    language: byId('btnLanguage'),
    fork: byId('fork')
  };
}
