function report = analyzeWindow(session, nowMs)
% Rolling descriptive features. All computations here run in MATLAB.
s = session.samples;
n = numel(s);
t = nan(n,1); hr = t; br = t; hrv = t; quality = zeros(n,1);
for k = 1:n
    t(k) = s(k).timestamp;
    if ~isempty(s(k).heartRate), hr(k) = s(k).heartRate; end
    if ~isempty(s(k).breathingRate), br(k) = s(k).breathingRate; end
    if ~isempty(s(k).hrv), hrv(k) = s(k).hrv; end
    quality(k) = s(k).quality;
end
valid = quality >= 0.7 & isfinite(hr) & isfinite(br);
window = t >= nowMs - 60000 & t <= nowMs;
good = valid & window;
report = struct('provider','matlab','timestamp',nowMs,'windowSeconds',60, ...
    'sampleCount',sum(window),'validSampleCount',sum(good), ...
    'qualityFraction',sum(good)/max(1,sum(window)), ...
    'ready',false,'baselineHeartRate',NaN,'baselineBreathingRate',NaN, ...
    'heartRateMean',mean(hr(good),'omitnan'), ...
    'breathingRateMean',mean(br(good),'omitnan'), ...
    'heartRateStd',std(hr(good),'omitnan'), ...
    'breathingRateStd',std(br(good),'omitnan'), ...
    'hrvMean',mean(hrv(good),'omitnan'), ...
    'heartRateSlopePerMinute',NaN,'breathingRateSlopePerMinute',NaN, ...
    'heartRateChangePercent',NaN,'breathingRateChangePercent',NaN);
% First continuous 30 seconds of good readings form a fixed baseline.
first = 0;
for k = 1:n
    if ~valid(k) || s(k).onBreak
        first = 0; continue;
    end
    if first == 0 || (k > 1 && t(k)-t(k-1) > 10000), first = k; end
    if t(k)-t(first) >= 30000 && k-first+1 >= 10
        report.baselineHeartRate = mean(hr(first:k));
        report.baselineBreathingRate = mean(br(first:k));
        break;
    end
end
indices = find(good);
if numel(indices) >= 10 && t(indices(end))-t(indices(1)) >= 20000
    x = (t(good)-t(indices(1)))/60000;
    fitHr = polyfit(x,hr(good),1); fitBr = polyfit(x,br(good),1);
    report.heartRateSlopePerMinute = fitHr(1);
    report.breathingRateSlopePerMinute = fitBr(1);
    report.ready = isfinite(report.baselineHeartRate) && ...
        report.qualityFraction >= 0.7 && nowMs-t(indices(end)) <= 10000;
end
if isfinite(report.baselineHeartRate)
    report.heartRateChangePercent = 100*(report.heartRateMean/report.baselineHeartRate-1);
    report.breathingRateChangePercent = 100*(report.breathingRateMean/report.baselineBreathingRate-1);
end
end
