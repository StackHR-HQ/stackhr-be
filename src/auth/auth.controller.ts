import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SignupBusinessDto } from './dto/signup-business.dto';
import { SwitchOrganizationDto } from './dto/switch-organization.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('business/register')
  @Post('business/signup')
  async signupBusiness(@Body() dto: SignupBusinessDto) {
    return this.authService.signupBusiness({
      email: dto.email,
      password: dto.password,
      confirmPassword: dto.confirmPassword,
      companyName: dto.companyName,
      organizationSlug: dto.organizationSlug,
    });
  }

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
      user: result.user,
      onboarding: result.onboarding,
    };
  }

  @Post('business/resend-verification')
  resendBusinessVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendBusinessVerification(dto.email);
  }

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
      },
      this.sessionOptions(request),
    );

    this.authService.setSessionCookie(response, result.token);
    return { user: result.user };
  }

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
  @Post('switch-organization')
  async switchOrganization(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SwitchOrganizationDto,
  ) {
    const token = this.authService.getTokenFromRequest(request);
    if (!token) {
      throw new UnauthorizedException('Authentication is required');
    }
    return this.authService.switchOrganization(token, dto.organizationId);
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
