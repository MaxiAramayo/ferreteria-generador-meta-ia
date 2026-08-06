import type { GenerationPolicyResponse } from "@aramayo/contracts";
import type { AuthenticatedSessionRecord } from "@aramayo/domain";
import { Body, Controller, Get, Patch } from "@nestjs/common";

import {
  CurrentSession,
  RequirePermission,
} from "../identity/identity.decorators.ts";
import { UpdateGenerationPolicyDto } from "./dto/update-generation-policy.dto.ts";
import { GenerationPolicyService } from "./generation-policy.service.ts";

@Controller("organization/generation-policy")
export class GenerationPolicyController {
  constructor(private readonly service: GenerationPolicyService) {}

  @Get()
  @RequirePermission("organization:manage")
  read(
    @CurrentSession() session: AuthenticatedSessionRecord,
  ): Promise<GenerationPolicyResponse> {
    return this.service.read(session.actor);
  }

  @Patch()
  @RequirePermission("organization:manage")
  update(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Body() input: UpdateGenerationPolicyDto,
  ): Promise<GenerationPolicyResponse> {
    return this.service.update(session.actor, input);
  }
}
