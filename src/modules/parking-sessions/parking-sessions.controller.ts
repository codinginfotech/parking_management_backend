import { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import { localDayRange } from '../../common/utils/dates';
import { parsePagination } from '../../common/utils/pagination';
import * as sessionsService from './parking-sessions.service';

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export async function entry(req: Request, res: Response): Promise<void> {
  const result = await sessionsService.createEntry(requireUser(req), req.body);
  sendSuccess(res, 'Vehicle entry created successfully', result, 201);
}

export async function active(req: Request, res: Response): Promise<void> {
  const query = req.query as Record<string, string | undefined>;
  const result = await sessionsService.listActiveSessions(
    requireUser(req),
    {
      lotId: query.lotId,
      search: query.search,
      vehicleType: query.vehicleType as never,
      sort: query.sort as never,
    },
    parsePagination(req.query, { limit: 50 })
  );
  sendSuccess(res, 'Active sessions fetched', result);
}

export async function lookup(req: Request, res: Response): Promise<void> {
  const session = await sessionsService.lookupActiveSession(
    requireUser(req),
    (req.query as Record<string, string>).vehicleNumber as string
  );
  sendSuccess(res, 'Active session found', { session });
}

export async function preview(req: Request, res: Response): Promise<void> {
  const session = await sessionsService.getSessionPreview(
    requireUser(req),
    req.params.id as string
  );
  sendSuccess(res, 'Session fetched', { session });
}

export async function exit(req: Request, res: Response): Promise<void> {
  const result = await sessionsService.completeExit(requireUser(req), {
    sessionId: req.params.id as string,
    paymentMethod: req.body.paymentMethod,
    transactionRef: req.body.transactionRef,
  });
  sendSuccess(res, 'Parking completed successfully', result);
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const session = await sessionsService.cancelSession(
    requireUser(req),
    req.params.id as string,
    req.body.reason
  );
  sendSuccess(res, 'Session cancelled', { session });
}

export async function history(req: Request, res: Response): Promise<void> {
  const query = req.query as Record<string, string | undefined>;
  const result = await sessionsService.listSessionHistory(
    requireUser(req),
    { lotId: query.lotId, search: query.search },
    parsePagination(req.query, { limit: 30 }),
    query.date ? localDayRange(query.date) : undefined
  );
  sendSuccess(res, 'Session history fetched', result);
}
