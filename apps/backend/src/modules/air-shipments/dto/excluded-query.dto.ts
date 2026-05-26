import { AlertType } from '../alert-evaluator'

export class ExcludedQueryDto {
  alertType?: AlertType
  page?: number
  limit?: number
  startDate?: string  // YYYY-MM-DD
  endDate?: string    // YYYY-MM-DD
}
