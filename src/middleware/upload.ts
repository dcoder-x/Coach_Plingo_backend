import multer from 'multer';
import { AppError } from '../utils/AppError';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024; // 10MB for audio

const storage = multer.memoryStorage();

const imageFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    cb(AppError.badRequest('Only image files are allowed'));
    return;
  }

  cb(null, true);
};

const audioFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  // Accept common audio formats
  const allowedMimes = [
    'audio/mpeg',
    'audio/mp4',
    'video/mp4',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'audio/x-m4a',
    'audio/aac',
    'audio/m4a',
    'audio/flac',
    'audio/x-flac',
  ];

  if (!allowedMimes.includes(file.mimetype)) {
    cb(AppError.badRequest(`Audio format not supported. Allowed: ${allowedMimes.join(', ')}`));
    return;
  }

  cb(null, true);
};

export const uploadAvatar = multer({
  storage,
  limits: {
    fileSize: MAX_AVATAR_SIZE_BYTES,
  },
  fileFilter: imageFileFilter,
});

export const uploadAudio = multer({
  storage,
  limits: {
    fileSize: MAX_AUDIO_SIZE_BYTES,
  },
  fileFilter: audioFileFilter,
});
