import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { OffboardEmployeeDto } from './dto/offboard-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { ReassignManagerDto } from './dto/reassign-manager.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  private checkOrgContext(user: AuthenticatedUser): string {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }
    return user.organizationId;
  }

  private async validateNoManagerCycle(
    employeeId: string,
    targetManagerId: string,
  ): Promise<void> {
    let currentId: string | null = targetManagerId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === employeeId) {
        throw new BadRequestException(
          'Circular manager hierarchy relationship detected',
        );
      }
      if (visited.has(currentId)) {
        break;
      }
      visited.add(currentId);

      const managerObj: { managerId: string | null } | null =
        await this.prisma.employee.findFirst({
          where: { id: currentId },
          select: { managerId: true },
        });

      currentId = managerObj?.managerId ?? null;
    }
  }

  async createEmployee(user: AuthenticatedUser, dto: CreateEmployeeDto) {
    const orgId = this.checkOrgContext(user);

    const existing = await this.prisma.employee.findFirst({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException(
        'An employee with this email already exists in the organization',
      );
    }

    if (dto.managerId) {
      const manager = await this.prisma.employee.findFirst({
        where: { id: dto.managerId },
      });
      if (!manager) {
        throw new NotFoundException('Specified manager not found');
      }
    }

    const employee = await this.prisma.employee.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        fullName: dto.fullName,
        email: dto.email,
        department: dto.department,
        jobTitle: dto.jobTitle,
        employmentType: dto.employmentType,
        salaryAmount: dto.salaryAmount,
        startDate: new Date(dto.startDate),
        managerId: dto.managerId ?? null,
        status: 'ACTIVE',
      },
    });

    return { employee };
  }

  async findAll(user: AuthenticatedUser, query: EmployeeQueryDto) {
    this.checkOrgContext(user);
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.department) {
      where.department = query.department;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { jobTitle: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [employees, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          manager: {
            select: {
              id: true,
              fullName: true,
              email: true,
              jobTitle: true,
            },
          },
        },
      }),
      this.prisma.employee.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: employees,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    this.checkOrgContext(user);
    const employee = await this.prisma.employee.findFirst({
      where: { id },
      include: {
        manager: {
          select: {
            id: true,
            fullName: true,
            email: true,
            jobTitle: true,
          },
        },
        directReports: {
          select: {
            id: true,
            fullName: true,
            email: true,
            jobTitle: true,
            status: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID "${id}" not found`);
    }

    return { employee };
  }

  async updateEmployee(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateEmployeeDto,
  ) {
    this.checkOrgContext(user);
    const employee = await this.prisma.employee.findFirst({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID "${id}" not found`);
    }

    if (dto.managerId) {
      if (dto.managerId === id) {
        throw new BadRequestException(
          'An employee cannot be their own manager',
        );
      }
      const manager = await this.prisma.employee.findFirst({
        where: { id: dto.managerId },
      });
      if (!manager) {
        throw new NotFoundException('Specified manager not found');
      }
      await this.validateNoManagerCycle(id, dto.managerId);
    }

    if (dto.email && dto.email !== employee.email) {
      const existing = await this.prisma.employee.findFirst({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException(
          'An employee with this email already exists',
        );
      }
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.fullName && { fullName: dto.fullName }),
        ...(dto.email && { email: dto.email }),
        ...(dto.department && { department: dto.department }),
        ...(dto.jobTitle && { jobTitle: dto.jobTitle }),
        ...(dto.employmentType && { employmentType: dto.employmentType }),
        ...(dto.salaryAmount !== undefined && {
          salaryAmount: dto.salaryAmount,
        }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.managerId !== undefined && { managerId: dto.managerId }),
        ...(dto.status && { status: dto.status }),
      },
    });

    return { employee: updated };
  }

  async reassignManager(
    user: AuthenticatedUser,
    employeeId: string,
    dto: ReassignManagerDto,
  ) {
    this.checkOrgContext(user);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID "${employeeId}" not found`);
    }

    const newManagerId = dto.managerId ?? null;

    if (newManagerId) {
      if (newManagerId === employeeId) {
        throw new BadRequestException(
          'An employee cannot be their own manager',
        );
      }
      const manager = await this.prisma.employee.findFirst({
        where: { id: newManagerId },
      });
      if (!manager) {
        throw new NotFoundException(
          `Manager with ID "${newManagerId}" not found`,
        );
      }
      await this.validateNoManagerCycle(employeeId, newManagerId);
    }

    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        managerId: newManagerId,
      },
      include: {
        manager: {
          select: {
            id: true,
            fullName: true,
            email: true,
            jobTitle: true,
          },
        },
      },
    });

    return {
      message: 'Manager reassigned successfully',
      employee: updated,
    };
  }

  async getHierarchyTree(user: AuthenticatedUser) {
    this.checkOrgContext(user);

    const allEmployees = await this.prisma.employee.findMany({
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        department: true,
        jobTitle: true,
        status: true,
        managerId: true,
      },
    });

    const empMap = new Map<string, any>();
    allEmployees.forEach((emp) => {
      empMap.set(emp.id, { ...emp, directReports: [] });
    });

    const rootEmployees: any[] = [];

    allEmployees.forEach((emp) => {
      const current = empMap.get(emp.id);
      if (emp.managerId && empMap.has(emp.managerId)) {
        empMap.get(emp.managerId).directReports.push(current);
      } else {
        rootEmployees.push(current);
      }
    });

    return {
      organizationTree: rootEmployees,
    };
  }

  async getDepartmentSummary(user: AuthenticatedUser) {
    this.checkOrgContext(user);

    const employees = await this.prisma.employee.findMany({
      orderBy: [{ department: 'asc' }, { fullName: 'asc' }],
      select: {
        id: true,
        fullName: true,
        email: true,
        department: true,
        jobTitle: true,
        status: true,
      },
    });

    const deptMap = new Map<string, any[]>();

    employees.forEach((emp) => {
      const dept = emp.department || 'Unassigned';
      if (!deptMap.has(dept)) {
        deptMap.set(dept, []);
      }
      deptMap.get(dept)!.push(emp);
    });

    const departments = Array.from(deptMap.entries()).map(
      ([department, memberList]) => ({
        department,
        count: memberList.length,
        employees: memberList,
      }),
    );

    return {
      departments,
      totalDepartments: departments.length,
      totalEmployees: employees.length,
    };
  }

  async offboardEmployee(
    user: AuthenticatedUser,
    id: string,
    dto: OffboardEmployeeDto,
  ) {
    this.checkOrgContext(user);
    const employee = await this.prisma.employee.findFirst({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID "${id}" not found`);
    }

    if (employee.status === 'OFFBOARDED') {
      throw new BadRequestException('Employee is already offboarded');
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        status: 'OFFBOARDED',
      },
    });

    return {
      message: 'Employee offboarded successfully',
      employee: updated,
      offboardDetails: {
        offboardDate: dto.offboardDate ?? new Date().toISOString(),
        reason: dto.reason ?? 'Standard offboarding',
      },
    };
  }
}
