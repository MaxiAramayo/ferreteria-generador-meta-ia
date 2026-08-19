/**
 * Capacidad de publicación del worker.
 *
 * Es donde los publicadores dejan de ser código suelto y quedan conectados a la
 * base, al almacenamiento y a Meta. Hasta `P5-T05` estaban a propósito sin
 * cablear: sin un diario persistente, un publicador conectado habría podido
 * duplicar una publicación después de un reinicio.
 *
 * El módulo sólo se arma cuando Meta está configurada. Sin credenciales no hay
 * publicación posible, y proveer publicadores que van a fallar en la primera
 * llamada esconde el problema hasta el peor momento; el tópico queda sin
 * consumidor y el despachador lo dice de forma explícita.
 */

import type { WorkerConfiguration } from "@aramayo/configuration/worker";
import type {
  MediaAssetRepository,
  MediaStorage,
  MetaConnectionRepository,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import {
  META_CONNECTION_REPOSITORY,
  PUBLICATION_ORDER_REPOSITORY,
} from "../database/database.tokens.ts";
import {
  MEDIA_ASSET_REPOSITORY,
  MEDIA_STORAGE,
} from "../media/media.tokens.ts";
import { FacebookGraphPublishingAdapter } from "./facebook-graph.adapter.ts";
import { FacebookPublisher } from "./facebook-publisher.service.ts";
import {
  HttpPublicMediaProbe,
  InstagramGraphAdapter,
} from "./instagram-graph.adapter.ts";
import { InstagramPublisher } from "./instagram-publisher.service.ts";
import { MetaPageCredentialAdapter } from "./meta-credential.adapter.ts";
import { PublicationOrderOutboxTransport } from "./publication-order.transport.ts";
import { TokenDecipher } from "./token-decipher.ts";

export const PUBLICATION_ORDER_TRANSPORT = Symbol(
  "PUBLICATION_ORDER_TRANSPORT",
);

@Module({})
export class PublishingModule {
  static forConfiguration(configuration: WorkerConfiguration): DynamicModule {
    // El token se provee siempre, con `null` cuando Meta no está configurada.
    // Nest inyecta por posición: un token que a veces existe y a veces no
    // correría los parámetros de quien lo consume.
    if (!configuration.meta.enabled) {
      return {
        exports: [PUBLICATION_ORDER_TRANSPORT],
        module: PublishingModule,
        providers: [{ provide: PUBLICATION_ORDER_TRANSPORT, useValue: null }],
      };
    }
    const graphApiVersion = configuration.meta.credentials.graphApiVersion;

    return {
      exports: [PUBLICATION_ORDER_TRANSPORT],
      module: PublishingModule,
      providers: [
        {
          inject: [
            PUBLICATION_ORDER_REPOSITORY,
            META_CONNECTION_REPOSITORY,
            MEDIA_ASSET_REPOSITORY,
            MEDIA_STORAGE,
          ],
          provide: PUBLICATION_ORDER_TRANSPORT,
          useFactory: (
            // El mismo objeto cumple los dos contratos: orden y diario.
            orders: PublicationOrderRepositoryWithJournal,
            connections: MetaConnectionRepository,
            media: MediaAssetRepository,
            storage: MediaStorage,
          ): PublicationOrderOutboxTransport | null => {
            const probe = new HttpPublicMediaProbe();
            const decipher = new TokenDecipher(configuration.tokenEncryption);
            return new PublicationOrderOutboxTransport(
              orders,
              connections,
              new MetaPageCredentialAdapter(connections, decipher),
              media,
              storage,
              new InstagramPublisher(
                new InstagramGraphAdapter(graphApiVersion),
                orders,
                probe,
              ),
              new FacebookPublisher(
                new FacebookGraphPublishingAdapter(graphApiVersion),
                orders,
                probe,
              ),
            );
          },
        },
      ],
    };
  }
}

/**
 * El repositorio de órdenes también es el diario de intentos. El tipo lo dice
 * para que el cableado no dependa de recordarlo.
 */
type PublicationOrderRepositoryWithJournal = ConstructorParameters<
  typeof PublicationOrderOutboxTransport
>[0] &
  ConstructorParameters<typeof InstagramPublisher>[1];
