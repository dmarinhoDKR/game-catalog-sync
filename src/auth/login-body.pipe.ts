import {
    BadRequestException,
    Injectable,
    PipeTransform,
} from '@nestjs/common';
import { normalizeEmail } from './normalize-email.js';

export interface LoginInput {
    email: string;
    password: string;
}

@Injectable()
export class LoginBodyPipe implements PipeTransform<unknown, LoginInput> {
  transform(value: unknown): LoginInput {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).length !== 2 ||
      !('email' in value) ||
      !('password' in value) ||
      typeof value.email !== 'string' ||
      typeof value.password !== 'string'
    ) {
      throw new BadRequestException('Invalid login input');
    }

    const email = normalizeEmail(value.email);
    const password = value.password;

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length === 0 ||
      Buffer.byteLength(password, 'utf8') > 1024
    ) {
      throw new BadRequestException('Invalid login input');
    }

    return { email, password };
  }
}
