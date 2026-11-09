import type { Operator } from './auth/session';
import type { BrandMembership } from './db/brands';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    operator: Operator;
    memberships: BrandMembership[];
    brand: BrandMembership; // the brand currently being worked on
  };
};
