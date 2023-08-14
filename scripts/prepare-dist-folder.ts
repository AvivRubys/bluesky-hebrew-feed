import fs from 'fs';
import path from 'path';

// Cleanup
fs.rmSync(path.join(__dirname, '..', 'dist'), { recursive: true, force: true });

// Model
fs.mkdirSync(path.join(__dirname, '..', 'dist/util/hebrew'), {
  recursive: true,
});
fs.copyFileSync(
  path.join(__dirname, '..', 'src/util/hebrew/model.ftz'),
  path.join(__dirname, '..', 'dist/util/hebrew/model.ftz'),
);

// Static files
const staticFolderSource = path.join(__dirname, '..', 'src/api/static');
fs.mkdirSync(path.join(__dirname, '..', 'dist/api/static'), {
  recursive: true,
});
for (const file of fs.readdirSync(staticFolderSource)) {
  fs.copyFileSync(
    path.join(staticFolderSource, file),
    path.join(__dirname, '..', 'dist/api/static', file),
  );
}
