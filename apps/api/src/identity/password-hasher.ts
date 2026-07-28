import {
  argon2id,
  hash as hashWithArgon2,
  verify as verifyWithArgon2,
} from "argon2";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

const passwordHashOptions = Object.freeze({
  hashLength: 32,
  memoryCost: 19_456,
  parallelism: 1,
  timeCost: 2,
  type: argon2id,
});

export class Argon2idPasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hashWithArgon2(password, passwordHashOptions);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verifyWithArgon2(passwordHash, password);
  }
}
