import multer from 'multer';
import { AppError } from '../utils/AppError';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

const storage = multer.memoryStorage();

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    cb(AppError.badRequest('Only image files are allowed'));
    return;
  }

  cb(null, true);
};

export const uploadAvatar = multer({
  storage,
  limits: {
    fileSize: MAX_AVATAR_SIZE_BYTES,
  },
  fileFilter,
});
