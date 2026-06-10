import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '../utils/AppError';

export interface UploadedImage {
  secureUrl: string;
  publicId: string;
}

export interface UploadedAudio {
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

  async uploadAudioBuffer(buffer: Buffer, mimeType: string, folder: string): Promise<UploadedAudio> {
    if (!this.isConfigured) {
      throw AppError.internal('Cloudinary is not configured');
    }

    const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: 'video',
    });

    return {
      secureUrl: result.secure_url,
      publicId: result.public_id,
    };
  }

  async uploadAudioDataUri(dataUri: string, folder: string): Promise<UploadedAudio> {
    if (!this.isConfigured) {
      throw AppError.internal('Cloudinary is not configured');
    }

    if (typeof dataUri !== 'string' || !dataUri.startsWith('data:audio/')) {
      throw AppError.badRequest('Invalid audio payload format');
    }

    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: 'video',
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

  async deleteAudio(publicId: string): Promise<void> {
    if (!this.isConfigured || !publicId) {
      return;
    }

    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
  }

  async deleteAudioByUrl(audioUrl: string): Promise<void> {
    if (!this.isConfigured || !audioUrl) {
      return;
    }

    const publicId = this.extractPublicIdFromUrl(audioUrl);
    if (!publicId) {
      return;
    }

    await this.deleteAudio(publicId);
  }

  private extractPublicIdFromUrl(assetUrl: string): string | null {
    try {
      const parsed = new URL(assetUrl);
      if (!parsed.hostname.includes('cloudinary.com')) {
        return null;
      }

      const segments = parsed.pathname.split('/').filter(Boolean);
      const uploadIndex = segments.indexOf('upload');
      if (uploadIndex === -1 || uploadIndex === segments.length - 1) {
        return null;
      }

      let publicIdSegments = segments.slice(uploadIndex + 1);
      const versionIndex = publicIdSegments.findIndex((segment) => /^v\d+$/.test(segment));
      if (versionIndex >= 0) {
        publicIdSegments = publicIdSegments.slice(versionIndex + 1);
      }

      if (publicIdSegments.length === 0) {
        return null;
      }

      const lastSegment = publicIdSegments[publicIdSegments.length - 1];
      publicIdSegments[publicIdSegments.length - 1] = lastSegment.replace(/\.[^.]+$/, '');

      return publicIdSegments.join('/');
    } catch {
      return null;
    }
  }
}
