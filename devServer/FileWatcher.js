import {watch, readFileSync} from 'fs';

export class FileWatcher {
  constructor(onChange) {
    this.watchedPaths = new Set();
    this.onChange = onChange;
  }
  watchPath(filePath) {
    try {
      if (this.watchedPaths.has(filePath)) return;
      this.watchedPaths.add(filePath);
      console.log('watching', filePath);

      let prev = readFileSync(filePath, 'utf-8');
      watch(filePath, (x) => {
        const curr = readFileSync(filePath, 'utf-8');
        if (curr === prev) return;
        prev = curr;
        this.onChange(filePath, x);
      });
    } catch (e) {
      console.error(`Could not watch ${filePath}: ${e.message}`);
    }
  }
}
