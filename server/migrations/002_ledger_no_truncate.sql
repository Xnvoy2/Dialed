-- Row triggers don't fire on TRUNCATE; block it too.
CREATE TRIGGER ledger_no_truncate BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
