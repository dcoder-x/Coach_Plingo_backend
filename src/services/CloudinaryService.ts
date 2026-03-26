import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '../utils/AppError';

export interface UploadedImage {
  secureUrl: string;
  publicId: string;
}

export class CloudinaryService {
  private readonly isConfigured: boolean;

  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    this.isConfigured = Boolean(cloudName && apiKey && apiSecret);

    if (this.isConfigured) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
    }
  }

  async uploadImage(buffer: Buffer, mimeType: string, folder: string): Promise<UploadedImage> {
    if (!this.isConfigured) {
      throw AppError.internal('Cloudinary is not configured');
    }

    const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: 'image',
    });

    return {
      secureUrl: result.secure_url,
      publicId: result.public_id,
    };
  }

  async deleteImage(publicId: string): Promise<void> {
    if (!this.isConfigured || !publicId) {
      return;
    }

    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  }
}
