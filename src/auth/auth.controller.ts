import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { readOptionalString, readString } from '../common/input';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Public: the accept page checks the link before asking for a password. */
  @Get('invitations/:token')
  previewInvitation(@Param('token') token: string) {
    return this.authService.previewInvitation(token);
  }

  /** Public: sets a password (or confirms an existing one) and signs the employee in. */
  @Post('invitations/accept')
  async acceptInvitation(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    body: AcceptInvitationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.acceptEmployeeInvitation(
      body,
      this.sessionOptions(request),
    );
    this.authService.setSessionCookie(response, result.token);
    return {
      user: this.authService.toFrontendUser(result.user),
      token: result.token,
    };
  }

  @Post(['business/register', 'business/signup'])
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
      user: this.authService.toFrontendUser(result.user),
      token: result.token,
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
        orgSlug: readOptionalString(body.orgSlug),
      },
      this.sessionOptions(request),
    );

    this.authService.setSessionCookie(response, result.token);
    return {
      user: this.authService.toFrontendUser(result.user),
      token: result.token,
    };
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
    return {
      user: this.authService.toFrontendUser(result.user),
      token: result.token,
    };
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
    return { user: this.authService.toFrontendUser(request.user!) };
  }

  private sessionOptions(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    };
  }
}
