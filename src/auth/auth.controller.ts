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
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('business/register')
  async registerBusiness(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.registerBusiness(
      {
        name: String(body.name ?? ''),
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
        organizationName: String(body.organizationName ?? ''),
        organizationSlug:
          body.organizationSlug === undefined
            ? undefined
            : String(body.organizationSlug),
      },
      this.sessionOptions(request),
    );

    this.authService.setSessionCookie(response, result.token);
    return { user: result.user };
  }

  @Post('business/login')
  async loginBusiness(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.loginBusiness(
      {
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
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
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
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
