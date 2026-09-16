import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { successResponse } from "../utils/apiResponse.js";
import { createMessage } from "../repositories/message.repository.js";
import { ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { MessageType } from "../models/Message.js";

// Validation schema for incoming internal message creation
const SaveMessageSchema = z.object({
  senderId: z.string().uuid("Invalid sender ID"),
  receiverId: z.string().uuid("Invalid receiver ID"),
  content: z.string().min(1, "Content cannot be empty").max(4000, "Message too long"),
});

/**
 * POST /api/internal/messages
 * 
 * Called by the Go WebSocket service to persist messages.
 * The Go service already handles real-time delivery; this just saves to DB.
 */
export async function saveMessageHandler(
  req: FastifyRequest,
  res: FastifyReply
): Promise<void> {
  const parseResult = SaveMessageSchema.safeParse(req.body);
  
  if (!parseResult.success) {
    throw new ValidationError("Validation failed " + parseResult.error.errors);
  }

  const { senderId, receiverId, content } = parseResult.data;

  // Persist the message in MongoDB
  const message = await createMessage({
    senderId,
    receiverId,
    content,
    messageType: MessageType.TEXT, // default for WebSocket chat
    isRead: false,
  });

  logger.info(
    { messageId: message._id, senderId, receiverId },
    "Internal message saved"
  );

  // Return the saved message matching the response shape expected by Go
  res.status(200).send(
    successResponse("Internal message saved", {
      id: message._id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: message.content,
      sentAt: message.sentAt.toISOString(),
    })
  );
}
