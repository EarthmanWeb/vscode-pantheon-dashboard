@dashboard
Feature: Content sync
  Dev and Test cards have a Sync icon that slides down a panel to clone the
  database and/or files from another environment. The panel is the confirm.

  Scenario: Sync icon on dev and test only
    When the dashboard renders
    Then the dev and test cards have a Sync Content icon
    And the live card has no Sync Content icon

  Scenario: Opening the panel
    Given the site has multidev "themes"
    When the user clicks the Sync Content icon on the test card
    Then the panel slides down
    And "Sync from" lists "dev", "live", "themes"
    And "Database", "Files" and "Clear caches afterwards" are unchecked
    And the "Sync" button is disabled

  Scenario Outline: Sync button needs database or files
    Given the sync panel is open on the test card
    When the user ticks <ticked>
    Then the "Sync" button is <state>

    Examples:
      | ticked                      | state    |
      | nothing                     | disabled |
      | "Clear caches afterwards"   | disabled |
      | "Database"                  | enabled  |
      | "Files"                     | enabled  |

  Scenario Outline: Syncing runs the matching clone
    Given the sync panel is open on the test card with "Sync from" "live"
    And <ticked> ticked
    When the user clicks "Sync"
    Then no native dialog is shown
    And the host clones from "live" to "test" with flags "<flags>"
    And the host waits up to 60 minutes for the clone workflows on "test"
    And the status reads "Synced live → test."
    And the panel closes with every box unchecked

    Examples:
      | ticked                                      | flags         |
      | "Database"                                  | --db-only     |
      | "Files"                                     | --files-only  |
      | "Database" and "Files"                      |               |
      | "Database" and "Clear caches afterwards"    | --db-only --cc |

  Scenario: Cancelling closes and resets the panel
    Given the sync panel is open with "Database" ticked
    When the user clicks "Cancel"
    Then the panel closes
    And every box is unchecked

  Scenario: Changing the dev environment closes the dev panel
    Given the sync panel is open on the dev card
    When the user selects multidev "themes"
    Then the dev sync panel closes

  Scenario: Sync with neither database nor files is rejected by the host
    When the host is asked to clone with neither database nor files
    Then it fails with "Select database and/or files to sync."
    And no command is run

  Scenario: Sync failure is shown
    Given the clone fails with "clone failed"
    When the user syncs the test card
    Then the test card shows the error "clone failed"
