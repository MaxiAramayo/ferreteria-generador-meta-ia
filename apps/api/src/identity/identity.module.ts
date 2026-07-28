import type { ApiConfiguration } from "@aramayo/configuration/api";
import { Module, type DynamicModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { API_CONFIGURATION } from "../configuration.tokens.ts";
import { AuthenticationController } from "./authentication.controller.ts";
import { AuthenticationService } from "./authentication.service.ts";
import {
  CsrfGuard,
  PermissionGuard,
  SessionAuthenticationGuard,
  TrustedOriginGuard,
} from "./identity.guards.ts";
import { PASSWORD_HASHER } from "./identity.tokens.ts";
import {
  Argon2idPasswordHasher,
  type PasswordHasher,
} from "./password-hasher.ts";

@Module({})
export class IdentityModule {
  static forConfiguration(configuration: ApiConfiguration): DynamicModule {
    return {
      controllers: [AuthenticationController],
      module: IdentityModule,
      providers: [
        AuthenticationService,
        { provide: API_CONFIGURATION, useValue: configuration },
        {
          provide: PASSWORD_HASHER,
          useFactory: (): PasswordHasher => new Argon2idPasswordHasher(),
        },
        { provide: APP_GUARD, useClass: TrustedOriginGuard },
        { provide: APP_GUARD, useClass: SessionAuthenticationGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    };
  }
}
