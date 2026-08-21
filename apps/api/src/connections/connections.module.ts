import type { ApiConfiguration } from "@aramayo/configuration/api";
import { Module, type DynamicModule } from "@nestjs/common";

import { API_CONFIGURATION } from "../configuration.tokens.ts";
import { META_GRAPH_PORT } from "./connections.tokens.ts";
import {
  DisabledMetaGraphAdapter,
  FacebookGraphAdapter,
} from "./facebook-graph.adapter.ts";
import type { MetaGraphPort } from "./meta-graph.port.ts";
import { MetaConnectionController } from "./meta-connection.controller.ts";
import { MetaConnectionService } from "./meta-connection.service.ts";
import { MetaComplianceController } from "./meta-compliance.controller.ts";
import { MetaComplianceService } from "./meta-compliance.service.ts";
import { TokenCipher } from "./token-cipher.ts";

@Module({})
export class ConnectionsModule {
  static forConfiguration(configuration: ApiConfiguration): DynamicModule {
    return {
      controllers: [MetaComplianceController, MetaConnectionController],
      module: ConnectionsModule,
      providers: [
        MetaConnectionService,
        MetaComplianceService,
        {
          provide: TokenCipher,
          useFactory: (): TokenCipher =>
            new TokenCipher(configuration.tokenEncryption),
        },
        { provide: API_CONFIGURATION, useValue: configuration },
        {
          provide: META_GRAPH_PORT,
          useFactory: (): MetaGraphPort =>
            configuration.meta.enabled
              ? new FacebookGraphAdapter(configuration.meta.credentials)
              : new DisabledMetaGraphAdapter(),
        },
      ],
    };
  }
}
