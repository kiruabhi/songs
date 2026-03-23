const fs = require('fs');
const appPath = 'client/src/App.tsx';
let appCode = fs.readFileSync(appPath, 'utf8');

if (!appCode.includes("import Dashboard from './Dashboard';")) {
   appCode = "import Dashboard from './Dashboard';\n" + appCode;
}

const lpStart = appCode.indexOf('function LandingPage({');
const roomStart = appCode.indexOf('function Room({');

if (lpStart !== -1 && roomStart !== -1) {
   const extracted = appCode.substring(lpStart, roomStart);
   appCode = appCode.replace(extracted, '');
}

// Ensure the App component mounts <Dashboard />
appCode = appCode.replace('<LandingPage user={user} onLogout={logout} onCreate={createRoom} onJoin={(id) => { window.history.pushState({}, \'\', `/${id}`); joinRoom(id); }} />', 
'<Dashboard user={user} onLogout={logout} onCreate={createRoom} onJoin={(id) => { window.history.pushState({}, \'\', `/${id}`); joinRoom(id); }} />');

fs.writeFileSync(appPath, appCode);
console.log("Successfully injected the Ultimate Dashboard Component!");
