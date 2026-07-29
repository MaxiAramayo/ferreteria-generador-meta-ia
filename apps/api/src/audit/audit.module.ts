import { Module } from "@nestjs/common";

import { ReliableOperationService } from "./reliable-operation.service.ts";

@Module({
  exports: [ReliableOperationService],
  providers: [ReliableOperationService],
})
export class AuditModule {}
