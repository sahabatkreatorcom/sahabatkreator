import { createAccessControl } from "better-auth/plugins/access";

const statement = {
    post: ["create", "publish", "delete"],
    analytics: ["view", "export"],
} as const;

export const ac = createAccessControl(statement);

export const member = ac.newRole({ post: ["create"] });
export const editor = ac.newRole({ post: ["create", "publish"], analytics: ["view"] });
export const owner = ac.newRole({ post: ["create", "publish", "delete"], analytics: ["view", "export"] });