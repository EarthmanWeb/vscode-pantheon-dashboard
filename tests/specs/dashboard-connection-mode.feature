@dashboard
Feature: Connection mode and SFTP commits
  The dev card toggles the selected dev or multidev environment between SFTP
  and Git mode and commits SFTP changes on the server.

  Scenario: Current mode is shown
    Given the dev environment is in "sftp" mode
    When the dev card loads
    Then the mode badge reads "SFTP"
    And the "SFTP" toggle button is active
    And the commit box is visible

  Scenario: Switching to SFTP mode needs no confirmation
    Given the dev environment is in "git" mode
    When the user clicks the "SFTP" toggle
    Then the host sets the connection mode to "sftp"
    And no confirm is shown
    And the mode badge reads "SFTP" after the workflow completes

  Scenario: Switching to Git with no uncommitted changes needs no confirmation
    Given the dev environment is in "sftp" mode with no uncommitted changes
    When the user clicks the "Git" toggle
    Then the host sets the connection mode to "git"
    And no confirm is shown

  Scenario: Switching to Git with uncommitted changes asks inline
    Given the dev environment is in "sftp" mode with 2 uncommitted changes
    When the user clicks the "Git" toggle
    Then an inline confirm slides down reading "Switching dev to Git mode discards 2 uncommitted SFTP change(s)."
    And the connection mode is not changed yet
    And no spinner is shown

  Scenario: Confirming the Git switch discards changes
    Given the Git switch confirm is open
    When the user clicks "Switch to Git"
    Then the host sets the connection mode to "git"
    And the confirm closes

  Scenario: Cancelling the Git switch keeps SFTP mode
    Given the Git switch confirm is open
    When the user clicks "Cancel"
    Then the confirm closes
    And the connection mode stays "sftp"

  Scenario: Uncommitted SFTP changes are listed
    Given the dev environment has an uncommitted change to "wp-content/a.php"
    When the dev card loads in SFTP mode
    Then "wp-content/a.php" is listed with its status, additions and deletions

  Scenario: Commit button requires a message
    Given the commit message is empty
    Then the "Commit to dev" button is disabled
    When the user types "Fix header"
    Then the "Commit to dev" button is enabled

  Scenario: Committing SFTP changes
    Given the dev environment has uncommitted changes
    When the user commits with message "Fix header"
    Then the host runs the env commit with message "Fix header"
    And the commit message box is cleared after the workflow completes
    And the test and live pending lists reload

  Scenario: Selecting a multidev retargets the dev card
    Given the site has multidev "themes"
    When the user selects "themes" in the dev selector
    Then the dev card reloads for "themes"
    And the commit button reads "Commit to themes"
