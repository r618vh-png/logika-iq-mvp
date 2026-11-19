ALTER TABLE cancel_flows ADD COLUMN exit_step INTEGER CHECK(exit_step BETWEEN 1 AND 10);
ALTER TABLE cancel_flows ADD COLUMN choice TEXT;
