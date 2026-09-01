const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const http = require('http');

const VERSION = '7.2.147';
const REPO = 'router-for-me/CLIProxyAPI';
const BIN_DIR = path.resolve(__dirname, '../bin');
const DATA_DIR = path.resolve(__dirname, '../data');
const CONFIG_FILE = path.join(DATA_DIR, 'cliproxy-config.yaml');
const PORT = 8317;

function getBinaryName() {
  return os.platform() === 'win32' ? 'cli-proxy-api.exe' : 'cli-proxy-api';
}

function getBinaryPath() {
  return path.join(BIN_DIR, getBinaryName());
}

function getAssetUrl() {
  const platform = os.platform();
  const arch = os.arch();

  let osName = '';
  if (platform === 'darwin') osName = 'darwin';
  else if (platform === 'linux') osName = 'linux';
  else if (platform === 'win32') osName = 'windows';
  else throw new Error(`不支援的作業系統平台: ${platform}`);

  let archName = '';
  if (arch === 'x64') archName = 'amd64';
  else if (arch === 'arm64') archName = 'aarch64';
  else throw new Error(`不支援的架構: ${arch}`);

  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  const filename = `CLIProxyAPI_${VERSION}_${osName}_${archName}.${ext}`;
  return {
    filename,
    url: `https://github.com/${REPO}/releases/download/v${VERSION}/${filename}`,
    isZip: ext === 'zip'
  };
}

async function ensureConfig() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultYaml = `# CLIProxyAPI 自動配置
host: "127.0.0.1"
port: ${PORT}
auth-dir: "~/.cli-proxy-api"
api-keys: []
debug: false
`;
    fs.writeFileSync(CONFIG_FILE, defaultYaml, 'utf8');
  }
}

async function ensureBinary() {
  const binPath = getBinaryPath();
  if (fs.existsSync(binPath)) {
    return binPath;
  }

  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const { filename, url, isZip } = getAssetUrl();
  const tmpArchive = path.join(os.tmpdir(), filename);

  console.log(`📦 下載 CLIProxyAPI v${VERSION} (${filename})...`);
  try {
    execSync(`curl -fSL -o "${tmpArchive}" "${url}"`, { stdio: 'inherit' });
  } catch (err) {
    throw new Error(`下載 CLIProxyAPI 失敗：${err.message}`);
  }

  console.log(`📂 解壓縮 CLIProxyAPI 至 ${BIN_DIR}...`);
  try {
    if (isZip) {
      if (os.platform() === 'win32') {
        execSync(`powershell -Command "Expand-Archive -Path '${tmpArchive}' -DestinationPath '${BIN_DIR}' -Force"`);
      } else {
        execSync(`unzip -o "${tmpArchive}" -d "${BIN_DIR}"`);
      }
    } else {
      execSync(`tar -xzf "${tmpArchive}" -C "${BIN_DIR}"`);
    }
  } catch (err) {
    throw new Error(`解壓縮失敗：${err.message}`);
  } finally {
    try { fs.unlinkSync(tmpArchive); } catch (_) {}
  }

  if (os.platform() !== 'win32') {
    try { fs.chmodSync(binPath, 0o755); } catch (_) {}
  }

  if (!fs.existsSync(binPath)) {
    throw new Error(`找不到解壓縮後的執行檔：${binPath}`);
  }

  console.log(`✅ CLIProxyAPI 安裝完成！`);
  return binPath;
}

function checkHealthy() {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/v1/models',
      timeout: 1500
    }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 401);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHealthy(maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const ok = await checkHealthy();
    if (ok) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

async function startProxy() {
  await ensureConfig();
  const isRunning = await checkHealthy();
  if (isRunning) {
    console.log(`✅ CLIProxyAPI 已在 http://127.0.0.1:${PORT} 運行中。`);
    return;
  }

  const binPath = await ensureBinary();
  console.log(`🚀 正在啟動 CLIProxyAPI (port ${PORT})...`);

  const child = spawn(binPath, ['-config', CONFIG_FILE], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  const healthy = await waitForHealthy();
  if (!healthy) {
    console.warn(`⚠️ CLIProxyAPI 啟動超時，請檢查 ${CONFIG_FILE} 或手動執行 ${binPath}`);
  } else {
    console.log(`✨ CLIProxyAPI 已就緒（http://127.0.0.1:${PORT}/v1）`);
  }
}

async function login(service = 'claude') {
  const binPath = await ensureBinary();
  await ensureConfig();
  const flag = service === 'codex' ? '-codex-login' : '-claude-login';
  console.log(`🔑 正在開啟 ${service} 授權登入...`);
  const child = spawn(binPath, [flag, '-config', CONFIG_FILE], { stdio: 'inherit' });
  child.on('close', (code) => {
    if (code === 0) {
      console.log(`🎉 ${service} 授權完成！`);
    } else {
      console.log(`授權結束，代碼: ${code}`);
    }
  });
}

async function main() {
  const cmd = process.argv[2] || 'start';
  if (cmd === 'install') {
    await ensureBinary();
    await ensureConfig();
  } else if (cmd === 'start') {
    await startProxy();
  } else if (cmd === 'login' || cmd === 'claude-login') {
    await login('claude');
  } else if (cmd === 'codex-login') {
    await login('codex');
  } else if (cmd === 'status') {
    const healthy = await checkHealthy();
    console.log(healthy ? `✅ CLIProxyAPI 運行中 (port ${PORT})` : `❌ CLIProxyAPI 未運行`);
  } else {
    console.log(`用法: node cliproxy-manager.js [install|start|login|codex-login|status]`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ CLIProxyAPI 管理程式錯誤:', err.message);
    process.exit(1);
  });
}

module.exports = { ensureBinary, startProxy, checkHealthy, getBinaryPath, PORT };
