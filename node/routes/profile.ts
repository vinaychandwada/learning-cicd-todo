import path from 'path';
import fs from 'fs';
import { Router, Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import Profile from '../models/Profile';
import auth from '../middleware/auth';

const router = Router();

const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.userId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, GIF or WEBP images are allowed'));
  },
});

router.use(auth);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await Profile.findOne({ user: req.userId });
    res.json(profile || null);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  upload.single('image'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, phone, address, bio } = req.body as {
        name?: string;
        email?: string;
        phone?: string;
        address?: string;
        bio?: string;
      };
      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Name is required' });
      }

      const update: Record<string, string> = {
        name: name.trim(),
        email: email?.trim() || '',
        phone: phone?.trim() || '',
        address: address?.trim() || '',
        bio: bio?.trim() || '',
      };

      if (req.file) {
        update.imageUrl = `/uploads/${req.file.filename}`;
      }

      const profile = await Profile.findOneAndUpdate(
        { user: req.userId },
        { $set: update, $setOnInsert: { user: req.userId } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      res.json(profile);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
