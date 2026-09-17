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
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { SignupBusinessDto } from './dto/signup-business.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Public: the accept page checks the link before asking for a password. */
  @Get('invitations/:token')
  previewInvitation(@Param('token') token: string) {
    return this.authService.previewInvitation(token);
  }

  /** Public: sets a password (or confirms an existing one) and signs the employee in. */
  @Throttle({ default: { ttl: 60000, limit: 5 } })
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

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post(['business/register', 'business/signup'])
  async signupBusiness(@Body() dto: SignupBusinessDto) {
    return this.authService.signupBusiness({
      email: dto.email,
      password: dto.password,
      confirmPassword: dto.confirmPassword,
      companyName: dto.companyName || dto.organizationName || '',
      organizationSlug: dto.organizationSlug,
    });
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('business/verify-email')
  async verifyBusinessEmail(
    @Body() dto: VerifyEmailDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyBusinessEmail(
      dto.email,
      dto.code,
      this.sessionOptions(request),
    );
    this.authService.setSessionCookie(response, result.token);
    return {
      user: this.authService.toFrontendUser(result.user),
      token: result.token,
      onboarding: result.onboarding,
    };
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('business/resend-verification')
  resendBusinessVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendBusinessVerification(dto.email);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('business/login')
  async loginBusiness(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.loginBusiness(
      {
        email: dto.email,
        password: dto.password,
        orgSlug: dto.orgSlug,
      },
      this.sessionOptions(request),
    );

    this.authService.setSessionCookie(response, result.token);
    return {
      user: this.authService.toFrontendUser(result.user),
      token: result.token,
    };
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('admin/login')
  async loginAdmin(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.loginStackhrAdmin(
      {
        email: dto.email,
        password: dto.password,
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
