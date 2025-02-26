import fs from 'fs';
import path from 'path';

export const deleteUnusedFiles = (uploadsDir: string, fileInUse: string[]) => {
    fs.readdir(uploadsDir, (err, files) => {
        if (err) {
            console.error(`Error reading directory: ${err.message}`);
            return;
        }

        files.forEach((file) => {
            const filePath = path.join(uploadsDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error(
                        `Error retrieving file stats: ${err.message}`
                    );
                    return;
                }

                if (!fileInUse.includes(file)) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error(
                                `Error deleting file: ${err.message}`
                            );
                        } else {
                            console.log(`Deleted unused file: ${filePath}`);
                        }
                    });
                }
            });
        });
    });
};
