import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddErrorMessageToShipmentUploads20260325000001 implements MigrationInterface {
  name = 'AddErrorMessageToShipmentUploads20260325000001'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shipment_uploads"
        ADD COLUMN "error_message" TEXT;
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shipment_uploads"
        DROP COLUMN "error_message";
    `)
  }
}
