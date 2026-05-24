export async function postChatMessage(args: {
  roomId: string;
  message: string;
  idempotencyKey: string;
}): Promise<{ postId: string }> {
  // Week 8 task: real chat adapter API with idempotency check.
  return { postId: `placeholder:${args.idempotencyKey}` };
}

export async function deleteChatPost(_args: { roomId: string; postId: string }) {
  // Used by ADR-007 compensation.
}
