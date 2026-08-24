import { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import * as lotsService from './parking-lots.service';

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export async function create(req: Request, res: Response): Promise<void> {
  const lot = await lotsService.createLot(requireUser(req), req.body);
  sendSuccess(res, 'Parking lot created successfully', { lot }, 201);
}

export async function list(req: Request, res: Response): Promise<void> {
  const lots = await lotsService.listLots(requireUser(req));
  sendSuccess(res, 'Parking lots fetched', { lots });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const lot = await lotsService.getLotDetail(requireUser(req), req.params.id as string);
  sendSuccess(res, 'Parking lot fetched', { lot });
}

export async function occupancy(req: Request, res: Response): Promise<void> {
  const lot = await lotsService.getLotOrFail(requireUser(req), req.params.id as string);
  const result = await lotsService.computeOccupancy(lot);
  sendSuccess(res, 'Occupancy fetched', { occupancy: result });
}

export async function update(req: Request, res: Response): Promise<void> {
  const lot = await lotsService.updateLot(
    requireUser(req),
    req.params.id as string,
    req.body
  );
  sendSuccess(res, 'Parking lot updated', { lot });
}
