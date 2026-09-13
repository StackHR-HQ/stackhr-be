export class ApprovalDecidedEvent {
  constructor(
    public readonly approvalRequestId: string,
    public readonly organizationId: string,
    public readonly type: string,
    public readonly requesterId: string,
    public readonly approverId: string,
    public readonly status: 'APPROVED' | 'REJECTED',
    public readonly rejectionReason?: string | null,
    public readonly subjectTable?: string | null,
    public readonly subjectId?: string | null,
  ) {}
}
