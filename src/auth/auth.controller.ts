import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { readOptionalString, readString } from '../common/input';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('business/register')
  @Post('business/signup')
  async signupBusiness(@Body() body: Record<string, unknown>) {
    return this.authService.signupBusiness({
      email: readString(body.email),
      password: readString(body.password),
      confirmPassword: readString(body.confirmPassword),
      companyName: readString(body.companyName ?? body.organizationName),
      organizationSlug: readOptionalString(body.organizationSlug),
    });
  }

  @Post('business/verify-email')
  async verifyBusinessEmail(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyBusinessEmail(
      readString(body.email),
      readString(body.code),
      this.sessionOptions(request),
    );
    this.authService.setSessionCookie(response, result.token);
    return {
      user: result.user,
      onboarding: result.onboarding,
    };
  }

  @Post('business/resend-verification')
  resendBusinessVerification(@Body() body: Record<string, unknown>) {
    return this.authService.resendBusinessVerification(readString(body.email));
  }

  @Post('business/login')
  async loginBusiness(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.loginBusiness(
      {
        email: readString(body.email),
        password: readString(body.password),
      },
      this.sessionOptions(request),
    );

    this.authService.setSessionCookie(response, result.token);
    return { user: result.user };
  }

  @Post('admin/login')
  async loginAdmin(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.loginStackhrAdmin(
      {
        email: readString(body.email),
        password: readString(body.password),
      },
      this.sessionOptions(request),
    );

    this.authService.setSessionCookie(response, result.token);
    return { user: result.user };
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = this.authService.getTokenFromRequest(request);
    if (token) {
      await this.authService.logout(token);
    }
    this.authService.clearSessionCookie(response);
    return { success: true };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }

  private sessionOptions(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    };
  }
}
