# Turn records into a defensible summary

**Lead with what the evidence supports, then explain uncertainty and the next useful observation.** This kit supports data-quality checks and non-diagnostic trends, not clinical interpretation or professional advice.

## 1. Establish the observation window

Keep measurement time, provider update time, and retrieval time distinct. Use the configured account date boundary; travel or a network address is not permission to change it. Label naps separately from the main sleep. Match recovery to its sleep/cycle before assigning it to a particular night.

## 2. Check coverage before calculating

Report valid heart-rate sample count and first/last measurement times. These are discrete synchronized samples, not a continuous waveform. Missing samples are not zero. An exhausted activity query does not prove every device record has synchronized; a bounded or failed scan may omit workouts. Do not calculate a complete daily training total from incomplete results.

## 3. Compare like with like

Compare a metric with the same provider, definition, time window, and the person's own available history. A short history is not an established baseline. Keep units and source labels. Do not add WHOOP and Garmin records that might describe the same workout; mark possible overlap until a match is confirmed.

## 4. Explain a change without inventing its cause

A defensible sentence contains an observation, comparison, limitation, and next check. Example, entirely synthetic:

> Available daytime heart-rate samples cover 09:10–17:20. Their median is higher than the previous recorded day, but coverage differs and exercise timing is unknown. Compare matched time windows before interpreting a trend.

Avoid “you recovered well” from a score alone, “you did not exercise” from an empty list, or “poor sleep” because a daytime-only watch has no night records. Do not infer diagnoses, prescribe treatment, or disguise medical advice as a disclaimer.

## Suggested report order

1. Data availability and freshness.
2. Main sleep and matched recovery, if available.
3. Resting heart rate / HRV with same-source history, if available.
4. Daytime heart-rate coverage and separately attributed activities.
5. Supported changes, uncertainty, and useful missing observations.

For permitted uses and restrictions, read [WHOOP API terms](https://developer.whoop.com/api-terms-of-use/) and [SECURITY](../../SECURITY.md). Review the intended use before deployment; technical access is not permission for every analysis.
