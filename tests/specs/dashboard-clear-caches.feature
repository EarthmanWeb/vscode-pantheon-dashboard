@dashboard
Feature: Clear caches
  Every card has a Clear Caches icon that asks inline before clearing.

  Scenario Outline: Clear caches asks inline
    When the user clicks the Clear Caches icon on the <card> card
    Then an inline confirm slides down reading "Clear all caches on <env>?"
    And no spinner or status message is shown

    Examples:
      | card | env  |
      | dev  | dev  |
      | test | test |
      | live | live |

  Scenario: The dev card targets the selected multidev
    Given the dev selector is on multidev "themes"
    When the user clicks the Clear Caches icon on the dev card
    Then the confirm reads "Clear all caches on themes?"

  Scenario: Confirming clears caches
    Given the clear caches confirm is open on the test card
    When the user clicks "Yes"
    Then the confirm closes
    And the status shows a spinner with "Clearing caches on test…"
    And the status does not mention "waiting for Pantheon"
    And the host clears caches on test and waits for its workflows
    And the status reads "Caches cleared on test."

  Scenario: Cancelling leaves the card unchanged
    Given the clear caches confirm is open on the test card
    When the user clicks "Cancel"
    Then the confirm closes
    And caches are not cleared
    And no spinner or status message is shown

  Scenario: Clear caches failure is shown
    Given clearing caches fails with "denied"
    When the user confirms clearing caches on test
    Then the test card shows the error "denied"
