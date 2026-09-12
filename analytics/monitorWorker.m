function monitorWorker(folder)
% One persistent process; jobs are published via atomic rename by Node.
ready = fopen(fullfile(folder,'ready'),'w'); fclose(ready);
while ~isfile(fullfile(folder,'stop'))
    jobs = dir(fullfile(folder,'*.request.json'));
    for k = 1:numel(jobs)
        input = fullfile(folder,jobs(k).name);
        output = strrep(input,'.request.json','.response.json');
        try
            request = jsondecode(fileread(input));
            response = analyzeWindow(request.session,request.now);
        catch
            response = struct('error','MATLAB could not analyze this window.');
        end
        temporary = [output '.tmp'];
        file = fopen(temporary,'w');
        if file ~= -1
            fprintf(file,'%s',jsonencode(response)); fclose(file);
            movefile(temporary,output,'f');
        end
        delete(input);
    end
    pause(0.1);
end
end
