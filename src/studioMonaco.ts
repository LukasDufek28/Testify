import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/language/json/monaco.contribution';

// Serve editor code and language workers with the app, without a CDN dependency.
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    return label === 'json'
      ? new Worker(new URL('monaco-editor/language/json/json.worker.js', import.meta.url), {type:'module'})
      : new Worker(new URL('monaco-editor/editor/editor.worker.js', import.meta.url), {type:'module'});
  },
};
loader.config({monaco});

