import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      let error: string;
      let message: string;

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        error = (resp['error'] as string) ?? exception.message;
        message =
          Array.isArray(resp['message'])
            ? (resp['message'] as string[]).join(', ')
            : (resp['message'] as string) ?? exception.message;
      } else {
        error = String(exceptionResponse);
        message = String(exceptionResponse);
      }

      response.status(status).json({ statusCode: status, error, message });
    } else {
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      });
    }
  }
}
