// Fake `vscode` module for tests that `require('../src/panel')`.
//
// panel.js does `require('vscode')`, which only resolves inside a real VS
// Code extension host. We hook into Node's module loader so that specific
// require('vscode') call resolves to this fake instead, letting panel.js
// load under plain node:test.
'use strict';

const Module = require('module');

const defaultConfig = {
  'pantheonDashboard.site': ''
};

const defaultWorkspaceFolders = [
  { name: 'example-site-master', uri: { fsPath: '/tmp/example-site-master' } }
];

const makeStub = () => {
  const calls = {
    showWarningMessage: [],
    showInformationMessage: [],
    executeCommand: [],
    getConfiguration: [],
    joinPath: []
  };

  let config = { ...defaultConfig };
  let workspaceFolders = defaultWorkspaceFolders;

  const stub = {
    window: {
      showWarningMessage: (...args) => {
        calls.showWarningMessage.push(args);
      },
      showInformationMessage: (...args) => {
        calls.showInformationMessage.push(args);
      }
    },
    commands: {
      executeCommand: (...args) => {
        calls.executeCommand.push(args);
      }
    },
    workspace: {
      get workspaceFolders() {
        return workspaceFolders;
      },
      getConfiguration: (section) => {
        calls.getConfiguration.push(section);
        return {
          get: (key) => config[`${section}.${key}`]
        };
      }
    },
    Uri: {
      joinPath: (...args) => {
        calls.joinPath.push(args);
        const base = args[0] && args[0].fsPath ? args[0].fsPath : '';
        const parts = args.slice(1);
        return { fsPath: [base, ...parts].join('/') };
      }
    }
  };

  return {
    stub,
    calls,
    // Test helpers (not part of the fake vscode API surface).
    setConfig(values) {
      config = { ...defaultConfig, ...values };
    },
    setWorkspaceFolders(folders) {
      workspaceFolders = folders;
    },
    reset() {
      calls.showWarningMessage.length = 0;
      calls.showInformationMessage.length = 0;
      calls.executeCommand.length = 0;
      calls.getConfiguration.length = 0;
      calls.joinPath.length = 0;
      config = { ...defaultConfig };
      workspaceFolders = defaultWorkspaceFolders;
    }
  };
};

let current = makeStub();
let hooked = false;

const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

const install = () => {
  if (hooked) {
    return current;
  }
  hooked = true;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
      return current.stub;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'vscode') {
      return 'vscode';
    }
    return originalResolveFilename.call(this, request, ...rest);
  };
  return current;
};

const uninstall = () => {
  if (!hooked) {
    return;
  }
  hooked = false;
  Module._load = originalLoad;
  Module._resolveFilename = originalResolveFilename;
};

const reset = () => {
  current.reset();
};

const configure = ({ config, workspaceFolders } = {}) => {
  if (config) {
    current.setConfig(config);
  }
  if (workspaceFolders) {
    current.setWorkspaceFolders(workspaceFolders);
  }
};

const getCalls = () => current.calls;

module.exports = { install, uninstall, reset, configure, getCalls };
