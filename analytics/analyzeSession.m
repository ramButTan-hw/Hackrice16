function report = analyzeSession(inputPath, outputPath)
% Analyze the same exported session contract as Node. Base MATLAB only.
% Before/after differences are descriptive, not causal effectiveness scores.
session = jsondecode(fileread(inputPath));
samples = session.samples;
count = numel(samples);
hr = nan(count, 1); breathing = hr; hrv = hr; timestamps = hr; quality = zeros(count, 1);
for k = 1:count
    timestamps(k) = samples(k).timestamp;
    quality(k) = samples(k).quality;
    if ~isempty(samples(k).heartRate), hr(k) = samples(k).heartRate; end
    if ~isempty(samples(k).breathingRate), breathing(k) = samples(k).breathingRate; end
    if ~isempty(samples(k).hrv), hrv(k) = samples(k).hrv; end
end
valid = quality >= 0.7 & isfinite(hr) & isfinite(breathing);
report.sessionId = session.id;
report.source = session.source;
report.sampleCount = count;
report.validSampleCount = sum(valid);
report.averageHeartRate = mean(hr(valid), 'omitnan');
report.averageBreathingRate = mean(breathing(valid), 'omitnan');
report.averageHrv = mean(hrv(valid), 'omitnan');
report.provider = 'matlab';
report.interpretation = 'Descriptive statistics; physiology does not establish focus or stress.';
file = fopen(outputPath, 'w');
assert(file ~= -1, 'Could not open report output.');
cleanup = onCleanup(@() fclose(file));
fprintf(file, '%s', jsonencode(report, PrettyPrint=true));
if count > 0
    figure('Visible', 'off', 'Color', 'w', 'Position', [100 100 1000 650]);
    figureCleanup = onCleanup(@() close(gcf));
    tiledlayout(2, 1);
    t = (timestamps - session.startedAt) / 1000;
    hr(~valid) = NaN; breathing(~valid) = NaN;
    nexttile; plot(t, hr, 'LineWidth', 1.5); ylabel('Heart rate (bpm)'); grid on;
    title(['Session readings — ' session.source]);
    nexttile; plot(t, breathing, 'LineWidth', 1.5); ylabel('Breaths / min'); xlabel('Session seconds'); grid on;
    % Make exported charts readable regardless of the desktop's light/dark theme.
    set(findall(gcf, 'Type', 'axes'), 'Color', 'w', 'XColor', [0.15 0.15 0.15], 'YColor', [0.15 0.15 0.15]);
    set(findall(gcf, 'Type', 'text'), 'Color', [0.15 0.15 0.15]);
    [folder, name] = fileparts(outputPath);
    exportgraphics(gcf, fullfile(folder, [name '.png']), Resolution=150);
end
end
