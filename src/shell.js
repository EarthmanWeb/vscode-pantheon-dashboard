const { execFile } = require('child_process');

// Run through the user's login shell so PATH matches the terminal (Homebrew
// terminus is not on PATH when VS Code is launched from the Dock). Args are
// passed as positional params — never interpolated into the command string.
const run = (bin, args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(
      process.env.SHELL || '/bin/zsh',
      ['-lc', 'exec "$0" "$@"', bin, ...args],
      { cwd, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message).trim()));
          return;
        }
        resolve(stdout);
      }
    );
  });

module.exports = { run };
