const { app, BrowserWindow, protocol, net, session, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const WWW = path.join(__dirname, '..', 'www');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
  }
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a10',
    title: 'SPOTI NOX',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // garde l'audio et l'analyse en direct actifs quand la fenetre est reduite
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  win.setMenuBarVisibility(false);
  win.loadURL('app://nox/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  // Sert le dossier www via app://nox/ (necessaire pour les modules JS et l'AudioWorklet)
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(WWW, p));
    if (!file.startsWith(WWW)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // Les API musicales (Deezer, Audius...) n'envoient pas toutes des en-tetes CORS :
  // l'app etant locale, on les ajoute aux reponses pour que fetch() et l'analyse audio fonctionnent.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['https://*/*', 'http://*/*'] },
    (details, callback) => {
      const headers = details.responseHeaders || {};
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase().startsWith('access-control-allow')) delete headers[k];
      }
      headers['Access-Control-Allow-Origin'] = ['*'];
      headers['Access-Control-Allow-Headers'] = ['*'];
      headers['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS'];
      callback({ responseHeaders: headers });
    }
  );

  // MusicBrainz exige un User-Agent identifiable
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://musicbrainz.org/*'] },
    (details, callback) => {
      details.requestHeaders['User-Agent'] = 'SPOTI-NOX/1.0 (lecteur perso)';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
