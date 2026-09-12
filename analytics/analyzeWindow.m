function report = analyzeWindow(session, nowMs)
% Per-signal features: missing breathing must not discard reliable pulse.
s = session.samples;
n = numel(s);
t = nan(n,1); hr = t; br = t; hrv = t;
qh = zeros(n,1); qb = qh; qv = qh; breaks = false(n,1);
for k = 1:n
    t(k) = s(k).timestamp;
    if ~isempty(s(k).heartRate), hr(k) = s(k).heartRate; end
    if ~isempty(s(k).breathingRate), br(k) = s(k).breathingRate; end
    if ~isempty(s(k).hrv), hrv(k) = s(k).hrv; end
    qh(k) = s(k).quality; qb(k) = s(k).quality; qv(k) = s(k).quality;
    if isfield(s(k),'qualityByMetric')
        qh(k) = s(k).qualityByMetric.heartRate;
        qb(k) = s(k).qualityByMetric.breathingRate;
        qv(k) = s(k).qualityByMetric.hrv;
    end
    breaks(k) = s(k).onBreak;
end
h = signalFeatures(t,hr,qh,breaks,nowMs);
b = signalFeatures(t,br,qb,breaks,nowMs);
window = t >= nowMs-60000 & t <= nowMs;
usable = window & ~breaks & ((qh >= .7 & isfinite(hr)) | (qb >= .7 & isfinite(br)));
report = struct('provider','matlab','timestamp',nowMs,'windowSeconds',60, ...
    'sampleCount',sum(window),'validSampleCount',sum(usable), ...
    'qualityFraction',sum(usable)/max(1,sum(window)), ...
    'ready',h.ready || b.ready,'heartRateReady',h.ready,'breathingReady',b.ready, ...
    'baselineHeartRate',h.baseline,'baselineBreathingRate',b.baseline, ...
    'heartRateMean',h.average,'breathingRateMean',b.average, ...
    'heartRateStd',h.deviation,'breathingRateStd',b.deviation, ...
    'hrvMean',mean(hrv(window & qv >= .7),'omitnan'), ...
    'heartRateSlopePerMinute',h.slope,'breathingRateSlopePerMinute',b.slope, ...
    'heartRateChangePercent',h.change,'breathingRateChangePercent',b.change);
if h.ready && b.ready
    report.reason = 'Heart and breathing baselines are ready.';
elseif h.ready
    report.reason = 'Heart-rate baseline ready; breathing is unavailable or still calibrating.';
elseif b.ready
    report.reason = 'Breathing baseline ready; heart rate is unavailable or still calibrating.';
else
    report.reason = 'No reliable baseline yet. Physiology must not drive conclusions.';
end
end

function result = signalFeatures(t,values,quality,breaks,nowMs)
valid = quality >= .7 & isfinite(values) & ~breaks;
window = t >= nowMs-60000 & t <= nowMs;
good = valid & window;
result = struct('ready',false,'baseline',NaN,'average',mean(values(good),'omitnan'), ...
    'deviation',std(values(good),'omitnan'),'slope',NaN,'change',NaN);
first = 0;
for k = 1:numel(t)
    if ~valid(k), first = 0; continue; end
    if first == 0 || (k > 1 && t(k)-t(k-1) > 10000), first = k; end
    if t(k)-t(first) >= 30000 && k-first+1 >= 10
        result.baseline = mean(values(first:k)); break;
    end
end
indices = find(good);
if numel(indices) >= 10 && t(indices(end))-t(indices(1)) >= 20000
    fit = polyfit((t(good)-t(indices(1)))/60000,values(good),1);
    result.slope = fit(1);
    result.ready = isfinite(result.baseline) && sum(good)/max(1,sum(window)) >= .7 && nowMs-t(indices(end)) <= 10000;
end
if isfinite(result.baseline), result.change = 100*(result.average/result.baseline-1); end
end
