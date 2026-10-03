# Strategy library frontend

The library preserves the existing IndexedDB implementation. No API routes, database models, authentication, or server versioning were added or changed.

`StrategiesPage` receives strategies, runs, loading/error state, and action callbacks from `App`. The backend developer can replace the callback implementations with his API client once his endpoints and contract are ready. Async mutation callbacks must reject on failure so the library can display an error, release its pending state, and keep deletion confirmation open for retry. Successful changes must refresh the displayed list.

Cards currently derive market, timeframe, and the last result from the most recent saved run. Untested strategies explicitly show that market and timeframe are chosen during testing. Version counts are not invented: immutable version persistence and server metadata remain part of the separate backend task.

Import accepts a strategy object, an array of strategies, or saved strategy objects with a JSON `source` string. It validates the whole file before saving, caps files at 2 MB and batches at 100 strategies, and reports the invalid item. Export retains the existing shared strategy schema. The backend must also validate writes independently.

Deleting a library strategy leaves saved backtest snapshots unchanged. Both library and studio deletion require confirmation. The New backtest menu action selects the strategy and opens single-market setup, without starting a run.

GitHub Actions runs build/type checking, engine/API unit tests, and all Playwright specs on every push to `devAdam`. Library coverage includes existing import/export/persistence flows plus empty/loading/error states, retry, batch validation, confirmed deletion, retained run snapshots, unique duplicates, stale selection cleanup, and selected-strategy setup. API integration, ownership, immutable versions, developer review, and staging acceptance remain outstanding until the backend is connected.
