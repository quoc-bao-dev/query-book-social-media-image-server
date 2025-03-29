import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import cron from 'node-cron';
import path from 'path';
import sharp from 'sharp'; // Thêm thư viện sharp
import { deleteUnusedFiles } from './cron';
import authMiddleware from './middleware';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT || 3008;
const app = express();

// Đường dẫn thư mục uploads
const uploadsDir = path.join(__dirname, '../public/uploads');

// Kiểm tra và tạo thư mục uploads nếu chưa tồn tại
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
const corsOrigins = process.env.CORS_ALLOWED_ORIGINS!.split(',');
console.log(corsOrigins);

app.use(
    cors({
        origin: corsOrigins, // Thay bằng domain frontend cụ thể khi triển khai production
        methods: ['GET', 'POST', 'OPTIONS'], // Đảm bảo hỗ trợ OPTIONS cho preflight
        allowedHeaders: ['Content-Type', 'Authorization'], // Các header frontend có thể gửi
    })
);

app.use(express.static('public/uploads'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cấu hình multer
const upload = multer({
    storage: multer.memoryStorage(), // Lưu vào RAM trước khi xử lý
    fileFilter: (req, file, cb) => {
        // Chỉ chấp nhận ảnh & video
        if (
            file.mimetype.startsWith('image/') ||
            file.mimetype.startsWith('video/')
        ) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed!'));
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 }, // Giới hạn 50MB
});

// Hàm nén ảnh bằng sharp
const compressImage = async (buffer: Buffer, fileName: string) => {
    const ext = path.extname(fileName).toLowerCase(); // Lấy phần mở rộng file gốc
    const time = Date.now(); // Thoi gian hien tai
    const outputPath = path.join(uploadsDir, `${time}-${fileName}`); // Giữ nguyên tên file

    let sharpInstance = sharp(buffer).resize({ width: 800 }); // Resize về 800px (giữ tỷ lệ)

    // Áp dụng nén tùy theo định dạng file
    if (ext === '.jpg' || ext === '.jpeg') {
        sharpInstance = sharpInstance.jpeg({ quality: 80 });
    } else if (ext === '.png') {
        sharpInstance = sharpInstance.png({ quality: 80 });
    }

    await sharpInstance.toFile(outputPath);
    return outputPath;
};
// Endpoint upload ảnh (có nén)
app.post(
    '/upload',
    authMiddleware,
    upload.single('file'),
    async (req: Request, res: Response) => {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        try {
            const compressedPath = await compressImage(
                req.file.buffer,
                req.file.originalname
            );
            return res.status(200).json({
                message: 'File uploaded & compressed successfully',
                fileName: path.basename(compressedPath),
                filePath: `/public/uploads/${path.basename(compressedPath)}`,
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: 'Error processing file' });
        }
    }
);

// Upload nhiều ảnh (có nén)
app.post(
    '/uploads',
    authMiddleware,
    upload.array('files', 10),
    async (req: Request, res: Response) => {
        if (!req.files || !(req.files as Express.Multer.File[]).length) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        try {
            const uploadedFiles = await Promise.all(
                (req.files as Express.Multer.File[]).map(async (file) => {
                    const compressedPath = await compressImage(
                        file.buffer,
                        file.originalname
                    );
                    return {
                        filename: path.basename(compressedPath),
                        path: `/public/uploads/${path.basename(
                            compressedPath
                        )}`,
                    };
                })
            );

            return res.status(200).json({
                message: 'Files uploaded & compressed successfully',
                files: uploadedFiles,
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: 'Error processing files' });
        }
    }
);

// Xóa file
app.post('/delete/:file', authMiddleware, (req: Request, res: Response) => {
    const { file } = req.params;
    const filePath = path.join(uploadsDir, file);

    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Failed to delete image' });
        }
        return res.status(200).json({ message: 'Delete image successful' });
    });
});

// Xử lý lỗi Multer
app.use((err: any, req: Request, res: Response, next: NextFunction): void => {
    if (err instanceof multer.MulterError) {
        res.status(400).json({ message: err.message });
    }
    if (err) {
        res.status(500).json({
            message: 'Internal Server Error',
            error: err.message,
        });
    }
    next();
});

// Lịch chạy cron job: Xóa hình ảnh cũ lúc 2 giờ sáng mỗi ngày
cron.schedule('0 2 * * *', () => {
    console.log('Running cron job to delete unused files...');
    const fileInUse: string[] = []; // TODO: Lấy danh sách file đang sử dụng
    deleteUnusedFiles(uploadsDir, fileInUse);
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
