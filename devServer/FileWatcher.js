import {watch} from 'fs';

export class FileWatcher {
  constructor(onChange) {
    this.watchedPaths = new Set();
    this.onChange = onChange;
  }
  watchPath(filePath) {
    if (this.watchedPaths.has(filePath)) return;
    this.watchedPaths.add(filePath);
    console.log('watching', filePath);
    watch(filePath, (x) => this.onChange(filePath, x));
  }
}
